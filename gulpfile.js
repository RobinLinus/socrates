'use strict';

// Include Gulp & Tools We'll Use
var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var del = require('del');
var runSequence = require('run-sequence');
var browserSync = require('browser-sync');
var reload = browserSync.reload;
var merge = require('merge-stream');
var path = require('path');
var fs = require('fs');
var glob = require('glob');
var historyApiFallback = require('connect-history-api-fallback');
var todo = require('gulp-todo');
var httpProxy = require('http-proxy');

var AUTOPREFIXER_BROWSERS = [
    'ie >= 10',
    'ie_mob >= 10',
    'ff >= 30',
    'chrome >= 34',
    'safari >= 7',
    'opera >= 23',
    'ios >= 7',
    'android >= 4.4',
    'bb >= 10'
];

var styleTask = function(stylesPath, srcs) {
    return gulp.src(srcs.map(function(src) {
            return path.join('src', stylesPath, src);
        }))
        .pipe($.changed(stylesPath, {
            extension: '.css'
        }))
        .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
        .pipe(gulp.dest('.tmp/' + stylesPath))
        .pipe($.if('*.css', $.cssmin()))
        .pipe(gulp.dest('dist/' + stylesPath))
        .pipe($.size({
            title: stylesPath
        }));
};

// Compile and Automatically Prefix Stylesheets
gulp.task('styles', function() {
    return styleTask('styles', ['**/*.css']);
});

gulp.task('elements', function() {
    return styleTask('elements', ['**/*.css']);
});

// Lint JavaScript
gulp.task('jshint', function() {
    return gulp.src([
            'src/scripts/**/*.js',
            'src/elements/**/*.js',
            'src/elements/**/*.html'
        ])
        .pipe(reload({
            stream: true,
            once: true
        }))
        .pipe($.jshint.extract()) // Extract JS from .html files
        .pipe($.jshint())
        .pipe($.jshint.reporter('jshint-stylish'))
        .pipe($.if(!browserSync.active, $.jshint.reporter('fail')));
});

// Optimize Images
gulp.task('images', function() {
    return gulp.src('src/images/**/*')
        .pipe($.cache($.imagemin({
            progressive: true,
            interlaced: true
        })))
        .pipe(gulp.dest('dist/images'))
        .pipe($.size({
            title: 'images'
        }));
});

// Copy All Files At The Root Level (src)
gulp.task('copy', function() {
    var src = gulp.src([
        'src/*',
        '!src/test',
        '!src/precache.json'
    ], {
        dot: true
    }).pipe(gulp.dest('dist'));

    var bower = gulp.src([
        'bower_components/**/*'
    ]).pipe(gulp.dest('dist/bower_components'));

    var elements = gulp.src(['src/elements/**/*.html'])
        .pipe(gulp.dest('dist/elements'));

    var swBootstrap = gulp.src(['bower_components/platinum-sw/bootstrap/*.js'])
        .pipe(gulp.dest('dist/elements/bootstrap'));

    var swToolbox = gulp.src(['bower_components/sw-toolbox/*.js'])
        .pipe(gulp.dest('dist/sw-toolbox'));

    var vulcanized = gulp.src(['src/elements/elements.html'])
        .pipe($.rename('elements.vulcanized.html'))
        .pipe(gulp.dest('dist/elements'));

    return merge(src, bower, elements, vulcanized, swBootstrap, swToolbox)
        .pipe($.size({
            title: 'copy'
        }));
});



// Scan Your HTML For Assets & Optimize Them
gulp.task('html', function() {
    var assets = $.useref.assets({
        searchPath: ['.tmp', 'src', 'dist']
    });

    return gulp.src(['src/**/*.html', '!src/{elements,test}/**/*.html'])
        // Replace path for vulcanized assets
        .pipe($.if('*.html', $.replace('elements/elements.html', 'elements/elements.vulcanized.html')))
        .pipe(assets)
        // Concatenate And Minify JavaScript
        .pipe($.if('*.js', $.uglify({
            preserveComments: 'some'
        })))
        // Concatenate And Minify Styles
        // In case you are still using useref build blocks
        .pipe($.if('*.css', $.cssmin()))
        .pipe(assets.restore())
        .pipe($.useref())
        // Minify Any HTML
        .pipe($.if('*.html', $.minifyHtml({
            quotes: true,
            empty: true,
            spare: true
        })))
        // Output Files
        .pipe(gulp.dest('dist'))
        .pipe($.size({
            title: 'html'
        }));
});

// Vulcanize imports
gulp.task('vulcanize', function() {
    var DEST_DIR = 'dist/elements';

    return gulp.src('dist/elements/elements.vulcanized.html')
        .pipe($.vulcanize({
            stripComments: true,
            inlineCss: true,
            inlineScripts: true
        }))
        .pipe(gulp.dest(DEST_DIR))
        .pipe($.size({
            title: 'vulcanize'
        }));
});

// Generate a list of files that should be precached when serving from 'dist'.
// The list will be consumed by the <platinum-sw-cache> element.
gulp.task('precache', function(callback) {
    var dir = 'dist';

    glob('{elements,scripts,styles}/**/*.*', {
        cwd: dir
    }, function(error, files) {
        if (error) {
            callback(error);
        } else {
            files.push('index.html', './', 'bower_components/webcomponentsjs/webcomponents-lite.min.js');
            var filePath = path.join(dir, 'precache.json');
            fs.writeFile(filePath, JSON.stringify(files), callback);
        }
    });
});

// Clean Output Directory
gulp.task('clean', del.bind(null, ['.tmp', 'dist']));

// Watch Files For Changes & Reload
gulp.task('serve', [], function() {
    var proxy = httpProxy.createProxyServer({
        target: 'http://capira.de/build/socratic'
    });
    browserSync({
        notify: false,
        logPrefix: 'CAPIRA',
        snippetOptions: {
            rule: {
                match: '<span id="browser-sync-binding"></span>',
                fn: function(snippet) {
                    return snippet;
                }
            }
        },
        // Run as an https by uncommenting 'https: true'
        // Note: this uses an unsigned certificate which on first access
        //       will present a certificate warning in the browser.
        // https: true,
        server: {
            baseDir: 'src',
            directory: true,
            
            middleware: [function(req, res, next) {
                var url = req.url;
                try {
                    if (url.match(/^\/(api)\//)) {
                        proxy.web(req, res, {
                            //target: 'http://capira.de/build/socrates'
                        });
                    } else {
                        next();
                    }
                } catch (e) {
                    next();
                }

            }],
            routes: {
                '/bower_components': 'bower_components',
                '/showcase': 'showcase',
                '/static': 'static',
            }
        }
    });

    gulp.watch(['src/**/*.html'], reload);
    gulp.watch(['src/styles/**/*.css'], ['styles', reload]);
    gulp.watch(['src/elements/**/*.css'], ['elements', reload]);
    gulp.watch(['src/{scripts,elements}/**/*.js'], ['jshint']);
    gulp.watch(['src/images/**/*'], reload);
});

// Build and serve the output from the dist build
gulp.task('serve:dist', ['default'], function() {
    browserSync({
        notify: false,
        logPrefix: 'CAPIRA',
        snippetOptions: {
            rule: {
                match: '<span id="browser-sync-binding"></span>',
                fn: function(snippet) {
                    return snippet;
                }
            }
        },
        // Run as an https by uncommenting 'https: true'
        // Note: this uses an unsigned certificate which on first access
        //       will present a certificate warning in the browser.
        // https: true,
        server: 'dist',
        middleware: [historyApiFallback()]
    });
});

// Build Production Files, the Default Task
gulp.task('default', ['clean'], function(cb) {
    runSequence(
        ['copy', 'styles'],
        'elements', ['jshint', 'images', 'fonts', 'html'],
        'vulcanize',
        cb);
    // Note: add , 'precache' , after 'vulcanize', if your are going to use Service Worker
});

// Load tasks for web-component-tester
// Adds tasks for `gulp test:local` and `gulp test:remote`
require('web-component-tester').gulp.init(gulp);

// Load custom tasks from the `tasks` directory
try {
    require('require-dir')('tasks');
} catch (err) {}



var minifyHTML = require('gulp-minify-html');
var minifyInline = require('gulp-minify-inline');
var inlinesource = require('gulp-inline-source');
var clean = require('gulp-clean');

/*
 *  to support polymer special css syntax you need to have installed the master of clean-css
 *       "clean-css": "jakubpawlowicz/clean-css#master"
 *   a hack is to type it into /node_modules/gulp-minify-inline/package.json
 *  maybe it works in our package too. it is added but not tested.
 *   
 */
gulp.task('vulcan', function() {
    var DEST_DIR = 'dist/quiz';
    return gulp.src('src/quiz/elements.html')
        .pipe($.vulcanize({
            stripComments: true,
            inlineCss: true,
            inlineScripts: true
        }))
        .pipe(minifyHTML())
        .pipe(minifyInline())
        .pipe(gulp.dest(DEST_DIR))
        .pipe($.size({
            title: 'vulcanize'
        }));
});

gulp.task('vulcanize-showcase', function() {
    var DEST_DIR = 'dist/quiz';
    return gulp.src('showcase/quiz/showcase.html')
        .pipe($.vulcanize({
            stripComments: true,
            inlineCss: true,
            inlineScripts: true
        }))
        .pipe(minifyHTML())
        .pipe(minifyInline())
        .pipe(gulp.dest(DEST_DIR))
        .pipe($.size({
            title: 'vulcanize'
        }));
});

gulp.task('inline-scripts', function() {
    return gulp.src('src/quiz/index.html')
        .pipe(inlinesource())
        .pipe($.if('*.html', $.replace('elements/elements.html', 'elements.html')))
        .pipe($.if('*.html', $.replace('/showcase/quiz/showcase.html', 'showcase.html')))
        .pipe($.if('*.html', $.replace('<link rel="import" href="showcase.html">', '<script src="showcase.js" inline></script>')))
        .pipe(gulp.dest('dist/quiz/'));
});

gulp.task('clean-showcase', function() {
    return gulp.src('dist/quiz/showcase.html')
        .pipe(inlinesource())
        .pipe($.if('*.html', $.replace('<script>', '')))
        .pipe($.if('*.html', $.replace('</script>', '')))
        .pipe($.if('*.html', $.replace('<script type="text/javascript">', '')))
        .pipe($.if('*.html', $.replace('<html><head><meta charset="UTF-8">', '')))
        .pipe($.if('*.html', $.replace('</head><body></body></html>', '')))
        .pipe($.rename('dist/quiz/showcase.js'))
        .pipe(gulp.dest(''));
});

gulp.task('clean-index', function() {
    return gulp.src('dist/quiz/index.html')
        .pipe(inlinesource())
        .pipe($.if('*.html', $.minifyHtml({
            quotes: true,
            empty: true,
            spare: true,
        })))
        .pipe(minifyInline())
        //.pipe($.if('*.html', $.replace('</body></html>', '<script>function bugfix(){setTimeout(function(){if(!document.getElementById("overlay1")){bugfix();}else{document.getElementById("overlay1").opened||app.openedOverlay=0;app.showOverlay(1)}},300)};bugfix();</script></body></html>')))
        .pipe(gulp.dest('dist/quiz/'));
});

gulp.task('copy-quiz-dependencies', function() {
    return gulp.src([
        'bower_components/katex/dist/**/*',
    ]).pipe(gulp.dest('../dist/bower_components/katex/dist/'));
});

gulp.task('copy-static', function() {
    return gulp.src([
        'static/**/*',
        'static/**/*'
    ]).pipe(gulp.dest('../dist/static'));
});

gulp.task('cleanup', function() {
    return gulp.src(['dist/quiz/showcase.html', 'dist/quiz/showcase.js'], {
            read: false
        })
        .pipe(clean());
});

gulp.task('build-quiz', function(cb) {
    runSequence(
        ['vulcan', 'vulcanize-showcase', 'copy-quiz-dependencies', 'copy-static'], ['inline-scripts', 'clean-showcase'], ['clean-index'], ['cleanup'],
        cb);
    // Note: add , 'precache' , after 'vulcanize', if your are going to use Service Worker
});

//TODO: Parse todos in inline-js
//TODO: Parse optional priorities, milestones, etc 
//TODO: Make diffs, collect history in git
//TODO: Build Todo-List on the fly with watch task (every 5 minutes?) commit changes automatically? 
//TODO: Parameter for todo-list to print personal todo-list?
//TODO: dynamic output in shell instead of a file? filter with regex? todo-command-linetool?
var argv = require('yargs').argv;
var query = (argv.query === undefined) ? '' : argv.query;
gulp.task('todo', function() {
    gulp.src(['**/*.js', '**/*.html', '!bower_components/**/*', '!node_modules/**/*']) //
        .pipe(todo())
        .pipe(gulp.dest('./'));
    // -> Will output a TODO.md with your todos 
});







/*
 *  Editor
 *   
 */
gulp.task('editor-vulcan', function() {
    var DEST_DIR = '../dist/editor';
    return gulp.src('src/editor/core/core-elements.html')
        .pipe($.vulcanize({
            stripComments: true,
            inlineCss: true,
            inlineScripts: true
        }))
        .pipe(minifyHTML())
        .pipe(gulp.dest(DEST_DIR))
        .pipe($.size({
            title: 'vulcanize'
        }));
});


gulp.task('editor-inline-scripts', function() {
    return gulp.src('src/editor/index.html')
        .pipe(inlinesource())
        .pipe($.if('*.html', $.replace('core/core-elements.html', 'core-elements.html')))
        .pipe(gulp.dest('../dist/editor/'));
});

gulp.task('copy-player-bullshit', function() {
    return gulp.src([
        'src/modules/video/**/*',
    ]).pipe(gulp.dest('../dist/modules/video'));
});


gulp.task('editor-clean-index', function() {
    return gulp.src('dist/editor/index.html')
        .pipe(inlinesource())
        .pipe($.if('*.html', $.minifyHtml({
            quotes: true,
            empty: true,
            spare: true,
        })))
        .pipe(minifyInline())
        //.pipe($.if('*.html', $.replace('</body></html>', '<script>function bugfix(){setTimeout(function(){if(!document.getElementById("overlay1")){bugfix();}else{document.getElementById("overlay1").opened||app.openedOverlay=0;app.showOverlay(1)}},300)};bugfix();</script></body></html>')))
        .pipe(gulp.dest('dist/editor/'));
});


gulp.task('build-editor', function(cb) {
    runSequence(
        ['editor-vulcan','editor-inline-scripts', 'copy-quiz-dependencies', 'copy-static','copy-player-bullshit'],
        cb);
    // Note: add , 'precache' , after 'vulcanize', if your are going to use Service Worker
});
