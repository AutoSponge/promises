// modified by @AutoSponge 2013.
//
// Copyright 2011 Traceur Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
(function(global) {
    'use strict';

    // Do not show source maps by default.
    traceur.options.sourceMaps = false;

    var SourceMapConsumer = traceur.outputgeneration.SourceMapConsumer;
    var SourceMapGenerator = traceur.outputgeneration.SourceMapGenerator;
    var ProjectWriter = traceur.outputgeneration.ProjectWriter;
    var ErrorReporter = traceur.util.ErrorReporter;

    var hasError = false;
    var debouncedCompile = debounced(compile, 200, 2000);
    var input = CodeMirror.fromTextArea(document.querySelector('.input'), {
        //onChange: debouncedCompile,
        //onCursorActivity: debouncedCompile.delay,
        lineNumbers: true,
        theme: "ambiance"
    });

    var evalElement = document.querySelector('pre.eval');
    var errorElement = document.querySelector('pre.error');
    var sourceMapElement = document.querySelector('pre.source-map');

    if (location.hash)
        input.setValue(decodeURIComponent(location.hash.slice(1)));

    /**
     * debounce time = min(tmin + [func's execution time], tmax).
     *
     * @param {Function} func
     * @param {number} tmin Minimum debounce time
     * @param {number} tmax Maximum debounce time
     * @return {Function} A debounced version of func with an attached "delay"
     *     function. "delay" will delay any pending debounced function by the
     *     current debounce time. If there are none pending, it is a no-op.
     */
    function debounced(func, tmin, tmax) {
        var id = 0;
        var t = tmin;
        function wrappedFunc() {
            var start = Date.now();
            id = 0;
            func();
            t = tmin + Date.now() - start; // tmin + [func's execution time]
            t = t < tmax ? t : tmax;
        }
        function debouncedFunc() {
            clearTimeout(id);
            id = setTimeout(wrappedFunc, t);
        }
        // id is nonzero only when a debounced function is pending.
        debouncedFunc.delay = function() { id && debouncedFunc(); }
        return debouncedFunc;
    }

    function setOptionsFromSource(source) {
        var re = /^\/\/ Options:\s*(.+)$/mg;
        var optionLines = source.match(re);
        if (optionLines) {
            optionLines.forEach(function(line) {
                re.lastIndex = 0;
                var m = re.exec(line);
                try {
                    traceur.options.fromString(m[1]);
                } catch (ex) {
                    // Ignore unknown options.
                }
            });
            createOptions();
        }
    }

    function compile() {
        console.log("%c ******* evaluating... ******* ", "background: green; color: white");
        hasError = false;
        errorElement.textContent = sourceMapElement.textContent = '';

        var reporter = new ErrorReporter();
        reporter.reportMessageInternal = function(location, format, args) {
            errorElement.textContent +=
                ErrorReporter.format(location, format, args) + '\n';
        };

        var url = location.href;
        var project = new traceur.semantics.symbols.Project(url);
        var name = 'repl';
        var contents = input.getValue();
        if (history.replaceState)
            history.replaceState(null, document.title,
                '#' + encodeURIComponent(contents));
        setOptionsFromSource(contents);
        var sourceFile = new traceur.syntax.SourceFile(name, contents);
        project.addFile(sourceFile);
        var res = traceur.codegeneration.Compiler.compile(reporter, project, false);
        if (reporter.hadError()) {
            hasError = true;
        } else {
            var options;
            if (traceur.options.sourceMaps) {
                var config = {file: 'traceured.js'};
                var sourceMapGenerator = new SourceMapGenerator(config);
                options = {sourceMapGenerator: sourceMapGenerator};
            }

            var source = ProjectWriter.write(res, options);

            try {
                evalElement.textContent = ('global', eval)(source);
            } catch(ex) {
                hasError = true;
                errorElement.textContent = ex;
            }

            if (traceur.options.sourceMaps) {
                var renderedMap = renderSourceMap(source, options.sourceMap);
                sourceMapElement.textContent = renderedMap;
            }
        }

        errorElement.hidden = !hasError;
    }

    function createOptionRow(name) {
        var li = document.createElement('li');
        var label = document.createElement('label');
        label.textContent = name;
        var cb = label.insertBefore(document.createElement('input'),
            label.firstChild);
        cb.type = 'checkbox';
        var checked = traceur.options[name];
        cb.checked = checked;
        cb.indeterminate = checked === null;
        cb.onclick = function() {
            traceur.options[name] = cb.checked;
            createOptions();
            compile();
        };
        li.appendChild(label);
        return li;
    }

    var options = [
        'experimental',
        'debug',
        'sourceMaps',
        'freeVariableChecker',
        'validate'
    ];

    var showAllOpts = true;
    var allOptsLength = Object.keys(traceur.options).length;
    var showMax = allOptsLength;

    function createOptions() {
        var optionsDiv = document.querySelector('.traceur-options');
        optionsDiv.textContent = '';
        if (showAllOpts) {
            var i = 0;
            Object.keys(traceur.options).forEach(function(name) {
                if (i++ >= showMax || options.lastIndexOf(name) >= 0)
                    return;
                optionsDiv.appendChild(createOptionRow(name));
            });
            optionsDiv.appendChild(document.createElement('hr'));
        }
        options.forEach(function(name) {
            optionsDiv.appendChild(createOptionRow(name));
        });
    }

    createOptions();

    function renderSourceMap(source, sourceMap) {
        var consumer = new SourceMapConsumer(sourceMap);
        var lines = source.split('\n');
        var lineNumberTable = lines.map(function(line, lineNo) {
            var generatedPosition = {
                line: lineNo + 1,
                column: 0
            };
            var position = consumer.originalPositionFor(generatedPosition);
            var lineDotColumn = position.line + '.' + position.column;
            return (lineNo + 1) + ': ' + line + ' -> ' + lineDotColumn;
        });
        return 'SourceMap:\n' + lineNumberTable.join('\n');
    }

    global.cm = input;


    $(".CodeMirror").on("keyup", function (e) {
        if ( e.which === 13 || e.which === 27 ) {
            debouncedCompile();
        }
    });

    $(function () {
        $("#run").on("click", debouncedCompile);
    });

}(this));

(function () {
    var examples = document.getElementById("examples");
    var lists = ["jQueryExamples", "QExamples", "WhenExamples", "ES6Examples"];
    var elms = {};
    var cache = {};
    var config = {
        jQueryExamples: [
            {
                title: "jQuery basic async function",
                body: function () {
                    /*
function asyncEvent() {
    var defer = new $.Deferred(), //constructor
        timer = Math.floor( 400 + Math.random() * 2000 );

    setTimeout( defer[timer % 2 ? "resolve" : "reject"], timer );

    return defer.promise();  //method
}

asyncEvent()
    //fulfilled
    .then( function() {
        console.log( "%c done ", "background: blue; color: white" );
    //rejected
    }, function() {
        console.log( "%c fail ", "background: red; color: white" );
    } );
                     */
                }
            }, {
                title: "jQuery progressing function",
                body: function () {
                    /*
function asyncEvent() {
    var defer = new $.Deferred(), //constructor
        timer = Math.floor( 400 + Math.random() * 2000 );

    setTimeout( defer[timer % 2 ? "resolve" : "reject"], timer );

    setTimeout( function working() {
        if ( defer.state() === "pending" ) { //method
            defer.notify( "pending... " );
            setTimeout( working, 500 );
        }
    }, 1 );
    return defer.promise();  //method
}

asyncEvent()
    //fulfilled
    .then( function() {
        console.log( "%c done ", "background: blue; color: white" );
    //rejected
    }, function() {
        console.log( "%c failed ", "background: red; color: white" );
    //progress
    }, function() {
        console.log( "%c pending...", "background: green; color: white" );
    } );
                     */
                }
            }, {
                title: "jQuery all (fail fast)",
                body: function () {
                    /*
//$asyncEvent(n {Any}, succeed {Boolean})
$.when( $asyncEvent(1), $asyncEvent(2), $asyncEvent(3) )
    .then( function() {
        console.log( "%c All done ", "background: blue; color: white" );
    }, function() {
        console.log( "%c Some fail ", "background: red; color: white" );
    } );
                     */
                }
            }, {
                title: "jQuery race (don't fail)",
                body: function () {
                    /*
//$asyncEvent(n {Any}, succeed {Boolean})
function race(arr) {
    var defer = $.Deferred();
    arr.map( function (thenable) {
        thenable.then( defer.resolve );
    } );
    return defer.promise();
}
race( [$asyncEvent(1), $asyncEvent(2), $asyncEvent(3)] )
    .then( function(n) {
        console.log( "%c Some done ", "background: blue; color: white" );
    } );
                     */
                }
            }, {
                title: "jQuery race (fail fast)",
                body: function () {
                    /*
//$asyncEvent(n {Any}, succeed {Boolean})
function race(arr) {
    var defer = $.Deferred();
    arr.map( function (thenable) {
        thenable.then(defer.resolve, defer.reject);
    } );
    return defer.promise();
}
race( [$asyncEvent(1), $asyncEvent(2), $asyncEvent(3)] )
    .then( function(n) {
        console.log( "%c Some done ", "background: blue; color: white" );
    }, function() {
        console.log( "%c Some fail ", "background: red; color: white" );
    } );
                     */
                }
            }, {
                title: "jQuery race (slow fail)",
                body: function () {
                    /*
//$asyncEvent(n {Any}, succeed {Boolean})
function race(arr) {
    var defer = $.Deferred(),
        count = 0,
        complete = 0;
    arr.map( function (thenable) {
        count += 1;
        thenable.then( defer.resolve, defer.notify );
    } );
    defer.progress( function (n) {
        complete += 1;
        if ( complete === count ) {
            defer.reject( n );
        }
    } );
    return defer.promise();
}
race( [$asyncEvent( 1 ), $asyncEvent( 2 ), $asyncEvent( 3 )] )
    .then(function(n) {
        console.log( "%c Some done " + n, "background: blue; color: white" );
    }, function (n) {
        console.log( "%c All fail " + n, "background: red; color: white" );
    } );
                     */
                }
            }, {
                title: "jQuery chain (fail fast)",
                body: function () {
                    /*
function fixed$asyncEvent(n) {
    return $asyncEvent( n, true );
}
$asyncEvent(0)
  .then( $asyncEvent )
  .then( $asyncEvent )
  .then( function ( n ) {
    console.log( "%c All done " + n, "background: blue; color: white" );
  }, function ( n ) {
    console.log( "%c Some failed " + n, "background: red; color: white" );
  } );
                     */
                }
            }, {
                title: "jQuery chain (reduce)",
                body: function () {
                    /*
function fixed$asyncEvent(n) {
    return $asyncEvent(n, true);
}
[
    $asyncEvent,
    $asyncEvent
].reduce( function (chain, next) {
  return chain.then(next)
}, $asyncEvent(0) )
  .then(function ( n ) {
    console.log( "%c All done " + n, "background: blue; color: white" );
  }, function ( n ) {
    console.log( "%c Some failed " + n, "background: red; color: white" );
  } );
                     */
                }
            }, {
                title: "jQuery spread (don't fail)",
                body: function () {
                    /*
function spread(arr) {
    var defer = $.Deferred(),
        results = [],
        count = 0;
    arr.map( function (thenable, i) {
        thenable.always( defer.notify.bind( null, i ) );
    } );
    defer.progress( function ( i, result ) {
        results[i] = result;
        count += 1;
        if ( count === arr.length ) {
            defer.resolve( results );
        }
    } );
    return defer.promise();
}
//$asyncEvent(n {Any}, succeed {Boolean})
spread( [$asyncEvent( 1 ), $asyncEvent( 2 ), $asyncEvent( 3 )] )
  .then( function ( arr ) {
    console.log( "%c All settled " + arr, "background: blue; color: white" );
  } );
                     */
                }
            }, {
                title: "jQuery spread (fail fast)",
                body: function () {
                    /*
function spread(arr) {
    var defer = $.Deferred(),
        results = [],
        count = 0;
    arr.map( function (thenable, i) {
        var notify = defer.notify.bind( null, i );
        thenable.then( notify, defer.reject );
    } );
    defer.progress( function ( i, result ) {
        results[i] = result;
        count += 1;
        if ( count === arr.length ) {
            defer.resolve( results );
        }
    } );
    return defer.promise();
}
//$asyncEvent(n {Any}, succeed {Boolean})
spread( [$asyncEvent( 1 ), $asyncEvent( 2 ), $asyncEvent( 3 )] )
  .then( function ( arr ) {
    console.log( "%c All done " + arr, "background: blue; color: white" );
  }, function ( n ) {
    console.log( "%c Some failed " + n, "background: red; color: white" );
  } );
                     */
                }
            }, {
                title: "uniqueness of fulfillment functions",
                body: function () {
                    /*
var a = new $.Deferred();
var b = new $.Deferred();
console.log( "same handler? " + a.resolve === b.resolve );
a.resolve.call( b );
console.log( "a state:" + a.state() );
console.log( "b state:" + b.state() );
                     */
                }
            }
        ],
        QExamples: [
            {
                title: "Q basic async function",
                body: function () {
                    /*
function asyncEvent() {
    var defer = Q.defer(),  //static method
        timer = Math.floor( 400 + Math.random() * 2000 );
    setTimeout( defer[timer % 2 ? "resolve" : "reject"], timer );
    return defer.promise; //property
}

asyncEvent()
    .then( function() {
        console.log( "%c done ", "background: blue; color: white" );
    }, function() {
        console.log( "%c fail ", "background: red; color: white" );
    } );
                    */
                }
            }, {
                title: "Q progressing function",
                body: function () {
                    /*
function asyncEvent() {
    var defer = Q.defer(),
        timer = Math.floor( 400 + Math.random() * 2000 );
    setTimeout( defer[timer % 2 ? "resolve" : "reject"], timer );
    setTimeout( function working() {
        if ( defer.promise.isPending() ) { //promise method
            defer.notify();
            setTimeout( working, 500 );
        }
    }, 1 );
    return defer.promise; //property
}
asyncEvent()
    .then( function() {
        console.log( "%c done ", "background: blue; color: white" );
    }, function() {
        console.log( "%c fail ", "background: red; color: white" );
    }, function () {
        console.log( "%c pending ", "background: green; color: white" );
    } );
                    */
                }
            }, {
                title: "Q all (fail fast)",
                body: function () {
                    /*
//QasyncEvent(n {Any}, succeed {Boolean})
Q.all( [
    QasyncEvent( 1 ),
    QasyncEvent( 2 ),
    QasyncEvent( 3 ),
] ).then( function (n) {
    console.log( "%c All done " + n, "background: blue; color: white" );
  }, function ( n ) {
    console.log( "%c Some failed " + n, "background: red; color: white" );
  } );
                     */
                }
            }, {
                title: "Q allSettled (don't fail)",
                body: function () {
                    /*
//QasyncEvent(n {Any}, succeed {Boolean})
Q.allSettled( [
    QasyncEvent( 1 ),
    QasyncEvent( 2 ),
    QasyncEvent( 3 ),
] ).then( function (arr) {
    console.log( "%c All settled " + JSON.stringify( arr ), "background: blue; color: white" );
} );
                     */
                }
            }, {
                title: "Q race (fail fast)",
                body: function () {
                    /*
//QasyncEvent(n {Any}, succeed {Boolean})
Q.race( [
    QasyncEvent( 1 ),
    QasyncEvent( 2 ),
    QasyncEvent( 3 ),
] ).then( function (n) {
    console.log( "%c Some done " + n, "background: blue; color: white" );
}, function (n) {
    console.log( "%c Some failed " + n, "background: red; color: white" );
} );
                     */
                }
            }, {
                title: "Q chain (fail fast)",
                body: function () {
                    /*
function fixedQasyncEvent(n) {
    return QasyncEvent( n, true );
}
[
    QasyncEvent,
    QasyncEvent,
    QasyncEvent,
].reduce( Q.when, 0 )
    .then( function (n) {
    console.log( "%c All done " + n, "background: blue; color: white" );
  }, function ( n ) {
    console.log( "%c Some failed " + n, "background: red; color: white" );
  } );
                     */
                }
            }, {
                title: "Q spread (fail fast)",
                body: function () {
                    /*
//QasyncEvent(n {Any}, succeed {Boolean})
Q.all( [
    QasyncEvent( 1 ),
    QasyncEvent( 2 ),
    QasyncEvent( 3 ),
] ).spread( function (a, b, c) {
    console.log( "%c All done " + a + b + c, "background: blue; color: white" );
  }, function ( n ) {
    console.log( "%c Some failed " + n, "background: red; color: white" );
  } );
                     */
                }
            }, {
                title: "Q spread (don't fail)",
                body: function () {
                    /*
//QasyncEvent(n {Any}, succeed {Boolean})
Q.allSettled( [
    QasyncEvent( 1 ),
    QasyncEvent( 2 ),
    QasyncEvent( 3 ),
] ).spread( function (a, b, c) {
    console.log( "%c All done " + JSON.stringify( arguments ), "background: blue; color: white" );
} );
                     */
                }
            }
        ],
        WhenExamples: [
            {
                title: "When basic async function",
                body: function () {
                    /*
function asyncEvent() {
    var defer = when.defer();
        timer = Math.floor( 400 + Math.random() * 2000 );
    setTimeout( defer[timer % 2 ? "resolve" : "reject"], timer );
    return defer.promise;
}

asyncEvent()
    //fulfilled
    .then( function() {
        console.log( "%c done ", "background: blue; color: white" );
    //rejected
    }, function() {
        console.log( "%c fail ", "background: red; color: white" );
    } );
                     */
                }
            },  {
                title: "When progressing function",
                body: function () {
                    /*
function asyncEvent() {
    var defer = when.defer();
        timer = Math.floor( 400 + Math.random() * 2000 );
    setTimeout( defer[timer % 2 ? "resolve" : "reject"], timer );
    setTimeout( function working() {
        if ( defer.promise.inspect().state === "pending" ) {
            defer.notify( "pending... " );
            setTimeout( working, 500 );
        }
    }, 1 );
    return defer.promise;
}

asyncEvent()
    //fulfilled
    .then( function() {
        console.log( "%c done ", "background: blue; color: white" );
    //rejected
    }, function() {
        console.log( "%c fail ", "background: red; color: white" );
    //progress
    }, function() {
        console.log( "%c pending...", "background: green; color: white" );
    });
                     */
                }
            }, {
                title: "When all (fail fast)",
                body: function () {
                    /*
//whenAsyncEvent(n {Any}, succeed {Boolean})
when.all( [whenAsyncEvent(1), whenAsyncEvent(2), whenAsyncEvent(3)] )
    .then( function() {
        console.log( "%c All done ", "background: blue; color: white" );
    }, function() {
        console.log( "%c Some fail ", "background: red; color: white" );
    } );
                     */
                }
            }, {
                title: "When all with parallel",
                body: function () {
                    /*
//whenAsyncEvent(n {Any}, succeed {Boolean})
function fixedWhenAsyncEvent(n) {
    return whenAsyncEvent( n, true );
}
when.parallel( [
    whenAsyncEvent,
    whenAsyncEvent,
    whenAsyncEvent,
], 0 ).then( function (arr) {
    console.log( "%c Some done " + JSON.stringify( arr ), "background: blue; color: white" );
}, function(n) {
    console.log( "%c Some fail " + n, "background: red; color: white" );
} );
                     */
                }
            }, {
                title: "When settle (don't fail)",
                body: function () {
                    /*
//whenAsyncEvent(n {Any}, succeed {Boolean})
when.settle( [
    whenAsyncEvent( 1 ),
    whenAsyncEvent( 2 ),
    whenAsyncEvent( 3 ),
] ).then( function (arr) {
    console.log( "%c All settled " + JSON.stringify( arr ), "background: blue; color: white" );
} );
                     */
                }
            }, {
                title: "When race (fail slow)",
                body: function () {
                    /*
//whenAsyncEvent(n {Any}, succeed {Boolean})
when.any( [
    whenAsyncEvent( 1 ),
    whenAsyncEvent( 2 ),
    whenAsyncEvent( 3 ),
] ).then( function (n) {
    console.log( "%c Some done " + n, "background: blue; color: white" );
}, function(arr) {
    console.log( "%c Some fail " + JSON.stringify( arr ), "background: red; color: white" );
} );
                     */
                }
            }, {
                title: "When race with some",
                body: function () {
                    /*
//whenAsyncEvent(n {Any}, succeed {Boolean})
when.some( [
    whenAsyncEvent( 1 ),
    whenAsyncEvent( 2 ),
    whenAsyncEvent( 3 ),
], 2 ).then( function (arr) {
    console.log( "%c Some done " + JSON.stringify( arr ), "background: blue; color: white" );
}, function(arr) {
    console.log( "%c Some fail " + JSON.stringify( arr ), "background: red; color: white" );
} );
                     */
                }
            }, {
                title: "When chain (fail fast)",
                body: function () {
                    /*
//whenAsyncEvent(n {Any}, succeed {Boolean})
function fixedWhenAsyncEvent(n) {
    return whenAsyncEvent( n, true );
}
when.sequence( [
    whenAsyncEvent,
    whenAsyncEvent,
    whenAsyncEvent,
], 0 ).then( function (n) {
    console.log( "%c Some done " + n, "background: blue; color: white" );
}, function(n) {
    console.log( "%c Some fail " + n, "background: red; color: white" );
} );
                     */
                }
            }, {
                title: "When pipeline (fail fast)",
                body: function () {
                    /*
//whenAsyncEvent(n {Any}, succeed {Boolean})
function fixedWhenAsyncEvent(n) {
    return whenAsyncEvent( n, true );
}
when.pipeline( [
    whenAsyncEvent,
    whenAsyncEvent,
    whenAsyncEvent,
], 0 ).then( function (n) {
    console.log( "%c Some done " + n, "background: blue; color: white" );
}, function(n) {
    console.log( "%c Some fail " + n, "background: red; color: white" );
} );
                     */
                }
            }
        ],
        ES6Examples: [
            {
                title: "ES6 basic async function",
                body: function () {
                    /*
function asyncEvent() {
    return new Promise( function(resolve, reject) {
        var timer = Math.floor( 400 + Math.random() * 2000 );
        setTimeout( timer % 2 ? resolve : reject, timer );
    } );
}
asyncEvent()
    .then(
        () => console.log( "%c done ", "background: blue; color: white" ),
        () => console.log( "%c fail ", "background: red; color: white" )
    );
                     */
                }
            }, {
                title: "ES6 progressing function",
                body: function () {
                    /*
function asyncEvent() {
    var pending = true,
        progress = null,
        thenable = new Promise( function(resolve, reject) {
            var timer = Math.floor( 400 + Math.random() * 2000 ),
                advice = fn => () => {pending = false, fn()};
            setTimeout( timer % 2 ? advice( resolve ) : advice( reject ), timer );
        });
    thenable.progress = fn => {return progress = fn, thenable};
    setTimeout( function working() {
        if ( pending && progress ) {
            progress();
            setTimeout( working, 500 );
        }
    }, 1 );
    return thenable;
}

asyncEvent()
    .progress( () => console.log( "%c pending... ", "background: green; color: white" ) )
    .then(
        () => console.log( "%c done ", "background: blue; color: white" ),
        () => console.log( "%c fail ", "background: red; color: white" )
    );
                     */
                }
            }, {
                title: "ES6 all (fail fast)",
                body: function () {
                    /*
//ES6asyncEvent(n {Any}, succeed {Boolean})
Promise.all( [
    ES6asyncEvent( 1 ),
    ES6asyncEvent( 2 ),
    ES6asyncEvent( 3 )
] ).then(
        n => console.log( "%c All done " + n, "background: blue; color: white" ),
        n => console.log( "%c Some failed " + n, "background: red; color: white" )
    );

                    */
                }
            }, {
                title: "ES6 race (fail fast)",
                body: function () {
                    /*
//ES6asyncEvent(n {Any}, succeed {Boolean})
Promise.race( [
    ES6asyncEvent( 1 ),
    ES6asyncEvent( 2 ),
    ES6asyncEvent( 3 )
] ).then(
        n => console.log( "%c All done " + n, "background: blue; color: white" ),
        n => console.log( "%c Some failed " + n, "background: red; color: white" )
    );

                    */
                }
            }, {
                title: "ES6 chain (fail fast)",
                body: function () {
                    /*
//ES6asyncEvent(n {Any}, succeed {Boolean})
function fixedES6asyncEvent(n) {
    return ES6asyncEvent( n, true );
}
[
    ES6asyncEvent,
    ES6asyncEvent,
    ES6asyncEvent
].reduce(
        (chain, next) => Promise.cast( chain ).then( next ),
        0
    ).then(
        n => console.log( "%c All done " + n, "background: blue; color: white" ),
        n => console.log( "%c Some failed " + n, "background: red; color: white" )
    );

                    */
                }
            }, {
                title: "ES6 compose chain",
                body: function () {
                    /*
//ES6asyncEvent(n {Any}, succeed {Boolean})
function fixedES6asyncEvent(n) {
    return ES6asyncEvent( n, true );
}
var delay = fn => n => Promise.cast( n ).then( fn );
var syncEvent = delay( ES6asyncEvent );
syncEvent( syncEvent( ES6asyncEvent( 0 ) ) );
                    */
                }
            }, {
                title: "ES6 generator chain",
                body: function () {
                    /*
//ES6asyncEvent(n {Any}, succeed {Boolean})
function fixedES6asyncEvent(n) {
    return ES6asyncEvent( n, true );
}
function *serial(list) {
  var n,
      chain = Promise.resolve(),
      next;
  while ( list.length ) {
    n = yield n;
    if ( typeof n === "undefined" ) {
      	next = list.shift();
    } else {
	    next = list.shift().bind( null, n );
    }
	chain = chain.then( next, next );
  }
}
var chain = serial( [ES6asyncEvent, ES6asyncEvent, ES6asyncEvent] );
chain.next();
chain.next( 1 );
chain.next();
chain.next( 2 );
                     */
                }
            }, {
                title: "ES6 lazy chain",
                body: function () {
                    /*
//ES6asyncEvent(n {Any}, succeed {Boolean})
function fixedES6asyncEvent(n) {
    return ES6asyncEvent( n, true );
}

function recur( state ) {
    if ( !state ) {
        console.log( "no state passed, continue" );
        return recur( {} );
    }
    if ( !state.count ) {

        state.count = 0;
    }
    if ( state.count < 4 ) {
        state.count += 1;
        console.log( "%c state: " + state.count, "background: yellow" );
        return new Promise( function (resolve, reject) {
            return ES6asyncEvent( state.count )
                .then( resolve.bind( null, state ), reject.bind( null, state ) );
        } )
            .then( recur );
    }
    return state;
}

recur()
    .then( state => console.log( "%c done, final state: " + JSON.stringify( state ),
        "background: blue; color: white" ) )
    .catch( state => console.log( "%c woops! Final state :" + JSON.stringify( state ),
        "background: red; color: white" ) );
                     */
                }
            },{
                title: "ES6 auto retry",
                body: function () {
                    /*
function tenacious(fn) {
    var done, promise = new Promise( resolve => done = resolve );
    return function retry(arg) {
        Promise.cast( fn( arg ) ).then( done.bind( null, "All done" ), retry );
        return promise;
    };
}
var autoRetryEvent = tenacious( ES6asyncEvent );
autoRetryEvent( 1 ).then( n => console.log( n ) );
                    */
                }
            }, {
                title: "ES6 auto retry generator",
                body: function () {
                    /*
//ES6asyncEvent(n {Any}, succeed {Boolean})
function *asyncEvent(max) {
  	var n = 0;
  	while ( n < max ) {
    	yield ES6asyncEvent( n );
      	n += 1;
  	}
}
var optimist = (function () {
	var done, fail,
        promise = new Promise( (resolve, reject) => {
          done = resolve;
          fail = reject;
        } ),
        chain = promise;
    return function continued( chain ) {
        var next = chain.next();
        next.done ? fail() :
        	next.value.then( done, () => continued( chain ) );
      	return promise;
    };
}());
optimist( asyncEvent( 3 ) ).then( // only try 3 times
  n => console.log( "%c Some done " + n, "background: blue; color: white" ),
  n => console.log( "%c All failed ", "background: red; color: white" )
);
                     */
                }
            },{
                title: "ES6 throttle",
                body: function () {
                    /*
var gateway = (function () {
    var gate = {};
    return function (fn, key) {
        var lock = key || "default",
            unlock = () => gate[lock] = null;
        gate[lock] = !gate[lock] ? Promise.cast( fn() ) : gate[lock].then( fn, fn );
        return gate[lock].then( unlock, unlock );
    };
}());
var log = (n) => () => console.log(n);
gateway(ES6asyncEvent.bind(null, 1))
  .then(log(2));
gateway(ES6asyncEvent.bind(null, 3))
  .then(log(4));
gateway(ES6asyncEvent.bind(null, 5))
  .then(log(6));
                     */
                }
            },{
                title: "ES6 _part_ chain",
                body: function () {
                    /*
function fixedES6asyncEvent(n) {
    return ES6asyncEvent( n, true );
}
_part_._borrow( this )( Array.prototype, "reduce" );
var chain = reduce_( (chain, next) => Promise.cast( chain ).then( next ) );
//ES6asyncEvent(n {Any}, succeed {Boolean})
chain( [
    ES6asyncEvent,
    ES6asyncEvent,
    ES6asyncEvent
], 0 ).then(
    n => console.log( "%c All done " + n, "background: blue; color: white" ),
    n => console.log( "%c Some failed " + n, "background: red; color: white" )
);
                    */
                }
            }, {
                title: "ES6 _part_ handleEach",
                body: function () {
                    /*
_part_._borrow( this )( Array.prototype, "map" );
_part_._borrow( this )( Promise.prototype, "then" );
var handleIt = then_(
    n => console.log( "%c cool " + n, "background: orange; color: white" ),
    n => console.log( "%c woops " + n, "background: black; color: white" )
);
var handleEach = map_( handleIt );
//ES6asyncEvent(n {Any}, succeed {Boolean})
handleEach( [
    ES6asyncEvent( 1 ),
    ES6asyncEvent( 2 ),
    ES6asyncEvent( 3 )
] );
                    */
                }
            }
        ]
    };

    //build lists
/*
    <li class="dropdown-submenu">
        <a tabindex="-1" href="#">More options</a>
        <ul class="dropdown-menu">
            <li><a tabindex="-1" href="#">Second level</a></li>
            <li class="dropdown-submenu">
                <a href="#">More..</a>
                <ul class="dropdown-menu">
                    <li><a href="#">3rd level</a></li>
                    <li><a href="#">3rd level</a></li>
                </ul>
            </li>
            <li><a href="#">Second level</a></li>
            <li><a href="#">Second level</a></li>
        </ul>
    </li>
*/
    lists.forEach(function (name) {
        elms[name] = document.getElementById( name );
    });

    lists.forEach( function (namespace) {
        config[namespace].forEach(function (e, i) {
            var str = e.body
                .toString()
                .replace(/[^\*]+\*/m, "")
                .split("*/")[0]
                .split("\n")
                .filter(function (s) {
                    return !!s && !s.match(/^\s+$/);
                })
                .join("\n");

            cache[e.title] = str;
            $('<li><a href="#">' + e.title + '</a></li>' ).appendTo(elms[namespace]);
        });
    } );

    //add handlers
    $("button[type=reset]" ).on("click", function () {
        window.location.href = window.location.href.split("#")[0];
    });

    $(examples).on("click", function (e) {
        cm.setValue( cache[e.target.textContent] );
        $("#heading" ).text( e.target.textContent );
        e.preventDefault();
    });

    //we don't want to force instances of Error for rejection reasons in demo
    Q.stopUnhandledRejectionTracking();

}());

//global helper functions
function getTimer() {
    return Math.floor( 400 + Math.random() * 2000 );
}
function $asyncEvent(n, succeed) {
    var timer = getTimer(),
        defer = $.Deferred();
    setTimeout( function () {
        switch ( succeed ) {
            case true:
                defer.resolve( n );
                break;
            case false:
                defer.reject( n );
                break;
            default:
                defer[timer % 2 ? "resolve" : "reject"]( n );
        }
    }, timer );
    defer.then(function(n) {
        console.log( "done " + n );
    }, function() {
        console.log( "fail " + n );
    });
    return defer.promise();
}
function QasyncEvent(n, succeed) {
    var timer = getTimer(),
        defer = Q.defer();
    setTimeout( function () {
        switch ( succeed ) {
            case true:
                defer.resolve( n );
                break;
            case false:
                defer.reject( n );
                break;
            default:
                defer[timer % 2 ? "resolve" : "reject"]( n );
        }
    }, timer );
    defer.promise.then(function(n) {
        console.log( "done " + n );
    }, function() {
        console.log( "fail " + n );
    });
    return defer.promise;
}
function ES6asyncEvent(n, succeed) {
    return new Promise( function(resolve, reject) {
        var timer = getTimer();
        setTimeout( function () {
            switch ( succeed ) {
                case true:
                    console.log( "done " + n );
                    resolve( n );
                    break;
                case false:
                    console.log( "failed " + n );
                    reject( n );
                    break;
                default:
                    console.log((timer % 2 ? "done " : "failed ") + n );
                    (timer % 2 ? resolve : reject)( n );
            }
        }, timer );
    });
}
function whenAsyncEvent(n, succeed) {
    var timer = getTimer(),
        defer = when.defer();
    setTimeout( function () {
        switch ( succeed ) {
            case true:
                defer.resolve( n );
                break;
            case false:
                defer.reject( n );
                break;
            default:
                defer[timer % 2 ? "resolve" : "reject"]( n );
        }
    }, timer );
    defer.promise.then(function(n) {
        console.log( "done " + n );
    }, function() {
        console.log( "fail " + n );
    });
    return defer.promise;
}