/**
 * command release utils
 * 
 * @author  Yang,junlong at 2016-08-08 15:03:33 build.
 * @version $Id$
 */

'use strict';

var lastModified = {};
var collection = {};
var total = {};

var LRServer
var LRTimer;

// compile && release project
exports.release = function (options) {
	var start = Date.now();
	var cost;
	var flag;

	process.stdout.write('\n Ω '.green.bold);
	// before compile each file callback
	options.beforeEach = function(file){
        flag = options.verbose ? '' : '.';
        cost = (new Date).getTime();
        total[file.subpath] = file;
    };
    // after compile each file callback
    options.afterEach = function(file){
        // calculate compile time
        cost = (new Date).getTime() - cost;
        if(cost > 200){
            flag = flag.bold.yellow;
            fis.log.debug(file.realpath);
        } else if(cost < 100){
            flag = flag.grey;
        }
        var mtime = file.getMtime().getTime();
        // collect file to deploy
        if(file.release && lastModified[file.subpath] !== mtime){
            if(!collection[file.subpath]){
                process.stdout.write(flag);
            }
            lastModified[file.subpath] = mtime;
            collection[file.subpath] = file;
        }
    };

    options.beforeCompile = function (file) {
        collection[file.subpath] = file;
        process.stdout.write(flag);
    };

    options.afterCompile = function (file) {

    };

    var deploy = require('./deploy.js');

    deploy.done = function(){
        clearTimeout(LRTimer);
        LRTimer = setTimeout(exports.reload, fis.config.get('livereload.delay', 200));
    };

    try {
        // release
        fis.release(options, function(ret){
            process.stdout.write(
                (options.verbose ? '' : ' ') +
                (Date.now() - start + 'ms').bold.green + '\n'
            );
            var changed = false;
            fis.util.map(collection, function(key, file){
                // get newest file from src
                collection[key] = ret.src[key] || file;
                changed = true;
            });
            if (changed){
                if(options.unique){
                    exports.timer(fis.compile.clean);
                }
                fis.util.map(ret.pkg, function(subpath, file){
                    collection[subpath] = file;
                    total[subpath] = file;
                });
                deploy(options, collection, total);
                collection = {};
                total = {};
                return;
            }
        });
    } catch(e) {
        process.stdout.write('\n [ERROR] ' + (e.message || e) + '\n');
        if(options.watch){
            process.stdout.write('\u0007');
        } else if(options.verbose) {
            throw e;
        } else {
            process.exit(1);
        }
    }
};

// watch project file change
exports.watch = function (options) {
	var root = fis.project.getProjectPath();
    var timer = -1;
    var safePathReg = /[\\\/][_\-.\s\w]+$/i;
    var ignoredReg = /[\/\\](?:output\b[^\/\\]*([\/\\]|$)|\.|mix-conf\.js$)/i;
        
    // init cache
    var files = fis.project.getSource();
    fis.util.map(files, function (subpath, file) {
        options.srcCache = options.srcCache || [];
        options.srcCache.push(file.realpath);
    });

    // first compile
    release(options);

    function listener(type){
        return function (path) {
            var p;
            if(safePathReg.test(path)){
                var path = fis.util(path);
                if (type == 'add' || type == 'change') {
                    if (options.srcCache.indexOf(path) == -1) {
                        options.srcCache.push(path);
                    }
                } else if (type == 'unlink') {
                    if ((p = options.srcCache.indexOf(path)) > -1) {
                        options.srcCache.splice(p, 1);
                    }
                } else if (type == 'unlinkDir') {
                    var toDelete = [];

                    options.srcCache.forEach(function(realpath, index) {
                        realpath.indexOf(path) === 0 && toDelete.unshift(index);
                    });

                    toDelete.forEach(function(index) {
                        options.srcCache.splice(index, 1);
                    });
                }
                clearTimeout(timer);
                timer = setTimeout(function() {
                    release(options);
                }, 500);
            }
        };
    }

    var chokidar = require('chokidar');
    var watcher = chokidar.watch(root, {
    	ignored : function(path) {
            var adjustPath = fis.util(path).replace(fis.project.getProjectPath(), '');
            // if path == project.root
            if (adjustPath == '') {
            	return false;
            } 
            // first chokidar emit add event
            if (adjustPath[0] != '/') {
            	adjustPath = '/' + adjustPath;
            }

            var include = fis.config.get('project.include');
            var exclude = fis.config.get('project.exclude');

            if (!fis.util.filter(adjustPath, include, exclude)) {
            	return true;
            }

            var ignored = ignoredReg.test(adjustPath);

            if (fis.config.get('project.watch.exclude')){
                ignored = ignored ||
                fis.util.filter(adjustPath, fis.config.get('project.watch.exclude'));
            }

            return ignored;
        },
        usePolling: fis.config.get('project.watch.usePolling', null),
        persistent: true,
        ignoreInitial: true
    });

    watcher
        .on('add', listener('add'))
        .on('change', listener('change'))
        .on('unlink', listener('unlink'))
        .on('unlinkDir', listener('unlinkDir'))
        .on('error', function(err) {
            err.message += fis.cli.colors.red('\n\tYou can set `fis.config.set("project.watch.usePolling", true)` fix it.');
            fis.log.error(err);
        });
};

// refresh page
exports.reload = function () {
	if(LRServer && LRServer.connections) {
		fis.util.map(LRServer.connections, function(id, connection){
			try {
				connection.send({
					command: 'reload',
					path: '*',
					liveCSS: true
				});
            } catch (e) {
                try {
                    connection.close();
                } catch (e) {}
                delete LRServer.connections[id];
            }
        });
    }
};

exports.live = function () {
    var LiveReloadServer = require('livereload-server-spec');
    var port = fis.config.get('livereload.port', 8132);
    LRServer = new LiveReloadServer({
        id: 'com.baidu.fis',
        name: 'fis-reload',
        version : fis.cli.info.version,
        port : port,
        protocols: {
            monitoring: 7
        }
    });
    
    LRServer.on('livereload.js', function(req, res) {
        var script = fis.util.fs.readFileSync(__dirname + '/vendor/livereload.js');
        res.writeHead(200, {
            'Content-Length': script.length,
            'Content-Type': 'text/javascript',
            'Connection': 'close'
        });
        res.end(script);
    });
    LRServer.listen(function(err) {
        if (err) {
            err.message = 'LiveReload server Listening failed: ' + err.message;
            fis.log.error(err);
        }
    });
    process.stdout.write('\n Ψ '.bold.yellow + port + '\n');
    //fix mac livereload
    process.on('uncaughtException', function (err) {
        if(err.message !== 'read ECONNRESET') throw  err;
    });
    //delete options.live;
};

exports.timer = function (callback) {
	process.stdout.write('\n δ '.bold.yellow);
    var now = Date.now();
    callback();
    process.stdout.write((Date.now() - now + 'ms').green.bold);
    process.stdout.write('\n');
};