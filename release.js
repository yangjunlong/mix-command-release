/**
 * mix command release
 * 
 * usage
 * mix release [options]
 * 
 * @author  Yang,junlong at 2016-08-05 11:25:01 build.
 * @version $Id$
 */

'use strict';

var util = require('./lib/util.js');

exports.name = 'release';
exports.desc = 'build and deploy your project';
exports.register = function (commander) {
    
    commander
        .option('-d, --dest <names>', 'release output destination', String, 'preview')
        .option('-m, --md5 [level]', 'md5 release option', Number)
        .option('-D, --domains', 'add domain name', Boolean, false)
        .option('-l, --lint', 'with lint', Boolean, false)
        .option('-t, --test', 'with unit testing', Boolean, false)
        .option('-o, --optimize', 'with optimizing', Boolean, false)
        .option('-p, --pack', 'with package', Boolean, true)
        .option('-w, --watch', 'monitor the changes of project')
        .option('-L, --live', 'automatically reload your browser')
        .option('-c, --clean', 'clean compile cache', Boolean, false)
        .option('-r, --root <path>', 'set project root')
        .option('-f, --file <filename>', 'set mix-conf file')
        .option('-u, --unique', 'use unique compile caching', Boolean, false)
        .option('--verbose', 'enable verbose output', Boolean, false)
        .action(function(){
        	var options = arguments[arguments.length - 1];
        	var confname = 'mix-conf.js';
        	var conffile;
        	var root = fis.util.realpath(process.cwd());

        	// log output configure
        	fis.log.throw = true;
            if(options.verbose){
                fis.log.level = fis.log.L_ALL;
            }

            // check config file if exist
            if(options.file){
                if(fis.util.isFile(options.file)){
                    conffile = fis.util.realpath(options.file);
                } else {
                    fis.log.error('invalid fis config file path [' + options.file + ']');
                }
            }
            // check project root directory && set configure file
            if(options.root){
                root = fis.util.realpath(options.root);
                if(fis.util.isDir(root)){
                    if(!conffile && fis.util.isFile(root + '/' + confname)){
                        conffile = root + '/' + confname;
                    }
                    delete options.root;
                } else {
                    fis.log.error('invalid project root path [' + options.root + ']');
                }
            } else {
                if(!conffile){
                    //try to find mix-conf.js
                    var cwd = root;
                    var pos = cwd.length;
                    do {
                        cwd  = cwd.substring(0, pos);
                        conffile = cwd + '/' + confname;
                        if(fis.util.exists(conffile)){
                            root = cwd;
                            break;
                        } else {
                            conffile = false;
                            pos = cwd.lastIndexOf('/');
                        }
                    } while(pos > 0);
                }
            }

            // init project
            mix.project.setProjectRoot(root);

            // load configure file
            if(conffile){
                var cache = fis.cache(conffile, 'conf');
                if(!cache.revert()){
                    options.clean = true;
                    cache.save();
                }
                require(conffile);
                fis.emitter.emit('mix-conf:loaded');
            } else {
                fis.log.warning('missing config file [' + confname + ']');
            }

            if(options.clean){
                util.timer(function(){
                    fis.cache.clean('compile');
                });
            }

            //domain, fuck EventEmitter
            if(options.domains){
                options.domain = true;
                delete options.domains;
            }

            if(options.live){
            	util.live();
            }

            switch (typeof options.md5){
                case 'undefined':
                    options.md5 = 0;
                    break;
                case 'boolean':
                    options.md5 = options.md5 ? 1 : 0;
                    break;
                default :
                    options.md5 = isNaN(options.md5) ? 0 : parseInt(options.md5);
            }
            // md5 > 0, force release hash file
            options.hash = options.md5 > 0;

            if(options.watch){
                util.watch(options);
            } else {
                util.release(options);
            }
        });
};
