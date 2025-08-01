

// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module != 'undefined' ? Module : {};

// See https://caniuse.com/mdn-javascript_builtins_object_assign

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)

if (!Module.expectedDataFileDownloads) {
  Module.expectedDataFileDownloads = 0;
}

Module.expectedDataFileDownloads++;
(function () {
  // When running as a pthread, FS operations are proxied to the main thread, so we don't need to
  // fetch the .data bundle on the worker
  if (Module['ENVIRONMENT_IS_PTHREAD']) return;
  var loadPackage = function (metadata) {

    var PACKAGE_PATH = '';
    if (typeof window === 'object') {
      PACKAGE_PATH = window['encodeURIComponent'](window.location.pathname.toString().substring(0, window.location.pathname.toString().lastIndexOf('/')) + '/');
    } else if (typeof process === 'undefined' && typeof location !== 'undefined') {
      // web worker
      PACKAGE_PATH = encodeURIComponent(location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf('/')) + '/');
    }
    var PACKAGE_NAME = 'chocolate-doom.data';
    var REMOTE_PACKAGE_BASE = 'chocolate-doom.data';
    if (typeof Module['locateFilePackage'] === 'function' && !Module['locateFile']) {
      Module['locateFile'] = Module['locateFilePackage'];
      err('warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)');
    }
    var REMOTE_PACKAGE_NAME = Module['locateFile'] ? Module['locateFile'](REMOTE_PACKAGE_BASE, '') : REMOTE_PACKAGE_BASE;

    var REMOTE_PACKAGE_SIZE = metadata['remote_package_size'];
    var PACKAGE_UUID = metadata['package_uuid'];

    function fetchRemotePackage(packageName, packageSize, callback, errback) {
      if (typeof process === 'object' && typeof process.versions === 'object' && typeof process.versions.node === 'string') {
        require('fs').readFile(packageName, function (err, contents) {
          if (err) {
            errback(err);
          } else {
            callback(contents.buffer);
          }
        });
        return;
      }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', packageName, true);
      xhr.responseType = 'arraybuffer';
      xhr.onprogress = function (event) {
        var url = packageName;
        var size = packageSize;
        if (event.total) size = event.total;
        if (event.loaded) {
          if (!xhr.addedTotal) {
            xhr.addedTotal = true;
            if (!Module.dataFileDownloads) Module.dataFileDownloads = {};
            Module.dataFileDownloads[url] = {
              loaded: event.loaded,
              total: size
            };
          } else {
            Module.dataFileDownloads[url].loaded = event.loaded;
          }
          var total = 0;
          var loaded = 0;
          var num = 0;
          for (var download in Module.dataFileDownloads) {
            var data = Module.dataFileDownloads[download];
            total += data.total;
            loaded += data.loaded;
            num++;
          }
          total = Math.ceil(total * Module.expectedDataFileDownloads / num);
          if (Module['setStatus']) Module['setStatus']('Downloading data... (' + loaded + '/' + total + ')');
        } else if (!Module.dataFileDownloads) {
          if (Module['setStatus']) Module['setStatus']('Downloading data...');
        }
      };
      xhr.onerror = function (event) {
        throw new Error("NetworkError for: " + packageName);
      }
      xhr.onload = function (event) {
        if (xhr.status == 200 || xhr.status == 304 || xhr.status == 206 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
          var packageData = xhr.response;
          callback(packageData);
        } else {
          throw new Error(xhr.statusText + " : " + xhr.responseURL);
        }
      };
      xhr.send(null);
    };

    function handleError(error) {
      console.error('package error:', error);
    };

    var fetchedCallback = null;
    var fetched = Module['getPreloadedPackage'] ? Module['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE) : null;

    if (!fetched) fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE, function (data) {
      if (fetchedCallback) {
        fetchedCallback(data);
        fetchedCallback = null;
      } else {
        fetched = data;
      }
    }, handleError);

    function runWithFS() {

      function assert(check, msg) {
        if (!check) throw msg + new Error().stack;
      }

      /** @constructor */
      function DataRequest(start, end, audio) {
        this.start = start;
        this.end = end;
        this.audio = audio;
      }
      DataRequest.prototype = {
        requests: {},
        open: function (mode, name) {
          this.name = name;
          this.requests[name] = this;
          Module['addRunDependency']('fp ' + this.name);
        },
        send: function () { },
        onload: function () {
          var byteArray = this.byteArray.subarray(this.start, this.end);
          this.finish(byteArray);
        },
        finish: function (byteArray) {
          var that = this;
          // canOwn this data in the filesystem, it is a slide into the heap that will never change
          Module['FS_createDataFile'](this.name, null, byteArray, true, true, true);
          Module['removeRunDependency']('fp ' + that.name);
          this.requests[this.name] = null;
        }
      };

      var files = metadata['files'];
      for (var i = 0; i < files.length; ++i) {
        new DataRequest(files[i]['start'], files[i]['end'], files[i]['audio'] || 0).open('GET', files[i]['filename']);
      }

      function processPackageData(arrayBuffer) {
        assert(arrayBuffer, 'Loading data file failed.');
        assert(arrayBuffer instanceof ArrayBuffer, 'bad input to processPackageData');
        var byteArray = new Uint8Array(arrayBuffer);
        var curr;
        // Reuse the bytearray from the XHR as the source for file reads.
        DataRequest.prototype.byteArray = byteArray;
        var files = metadata['files'];
        for (var i = 0; i < files.length; ++i) {
          DataRequest.prototype.requests[files[i].filename].onload();
        } Module['removeRunDependency']('datafile_chocolate-doom.data');

      };
      Module['addRunDependency']('datafile_chocolate-doom.data');

      if (!Module.preloadResults) Module.preloadResults = {};

      Module.preloadResults[PACKAGE_NAME] = { fromCache: false };
      if (fetched) {
        processPackageData(fetched);
        fetched = null;
      } else {
        fetchedCallback = processPackageData;
      }

    }
    if (Module['calledRun']) {
      runWithFS();
    } else {
      if (!Module['preRun']) Module['preRun'] = [];
      Module["preRun"].push(runWithFS); // FS is not initialized yet, wait for it
    }

  }
  loadPackage({ "files": [{ "filename": "/DOOM1.WAD", "start": 0, "end": 28795076 }], "remote_package_size": 28795076, "package_uuid": "fb208aae-1820-4268-91c4-3973034b1336" });

})();


// All the pre-js content up to here must remain later on, we need to run
// it.
if (Module['ENVIRONMENT_IS_PTHREAD']) Module['preRun'] = [];
var necessaryPreJSTasks = Module['preRun'].slice();

if (!Module['preRun']) throw 'Module.preRun should exist because file support used it; did a pre-js delete it?';
necessaryPreJSTasks.forEach(function (task) {
  if (Module['preRun'].indexOf(task) < 0) throw 'All preRun tasks that exist before user pre-js code should remain after; did you replace Module or modify Module.preRun?';
});


// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = Object.assign({}, Module);

var arguments_ = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = typeof window == 'object';
var ENVIRONMENT_IS_WORKER = typeof importScripts == 'function';
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = typeof process == 'object' && typeof process.versions == 'object' && typeof process.versions.node == 'string';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

if (Module['ENVIRONMENT']) {
  throw new Error('Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -s ENVIRONMENT=web or -s ENVIRONMENT=node)');
}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var read_,
  readAsync,
  readBinary,
  setWindowTitle;

// Normally we don't log exceptions but instead let them bubble out the top
// level where the embedding environment (e.g. the browser) can handle
// them.
// However under v8 and node we sometimes exit the process direcly in which case
// its up to use us to log the exception before exiting.
// If we fix https://github.com/emscripten-core/emscripten/issues/15080
// this may no longer be needed under node.
function logExceptionOnExit(e) {
  if (e instanceof ExitStatus) return;
  let toLog = e;
  if (e && typeof e == 'object' && e.stack) {
    toLog = [e, e.stack];
  }
  err('exiting due to exception: ' + toLog);
}

var fs;
var nodePath;
var requireNodeFS;

if (ENVIRONMENT_IS_NODE) {
  if (!(typeof process == 'object' && typeof require == 'function')) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');
  if (ENVIRONMENT_IS_WORKER) {
    scriptDirectory = require('path').dirname(scriptDirectory) + '/';
  } else {
    scriptDirectory = __dirname + '/';
  }

  // include: node_shell_read.js


  requireNodeFS = () => {
    // Use nodePath as the indicator for these not being initialized,
    // since in some environments a global fs may have already been
    // created.
    if (!nodePath) {
      fs = require('fs');
      nodePath = require('path');
    }
  };

  read_ = function shell_read(filename, binary) {
    requireNodeFS();
    filename = nodePath['normalize'](filename);
    return fs.readFileSync(filename, binary ? undefined : 'utf8');
  };

  readBinary = (filename) => {
    var ret = read_(filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  readAsync = (filename, onload, onerror) => {
    requireNodeFS();
    filename = nodePath['normalize'](filename);
    fs.readFile(filename, function (err, data) {
      if (err) onerror(err);
      else onload(data.buffer);
    });
  };

  // end include: node_shell_read.js
  if (process['argv'].length > 1) {
    thisProgram = process['argv'][1].replace(/\\/g, '/');
  }

  arguments_ = process['argv'].slice(2);

  if (typeof module != 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function (ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  // Without this older versions of node (< v15) will log unhandled rejections
  // but return 0, which is not normally the desired behaviour.  This is
  // not be needed with node v15 and about because it is now the default
  // behaviour:
  // See https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode
  process['on']('unhandledRejection', function (reason) { throw reason; });

  quit_ = (status, toThrow) => {
    if (keepRuntimeAlive()) {
      process['exitCode'] = status;
      throw toThrow;
    }
    logExceptionOnExit(toThrow);
    process['exit'](status);
  };

  Module['inspect'] = function () { return '[Emscripten Module object]'; };

} else
  if (ENVIRONMENT_IS_SHELL) {

    if ((typeof process == 'object' && typeof require === 'function') || typeof window == 'object' || typeof importScripts == 'function') throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

    if (typeof read != 'undefined') {
      read_ = function shell_read(f) {
        return read(f);
      };
    }

    readBinary = function readBinary(f) {
      let data;
      if (typeof readbuffer == 'function') {
        return new Uint8Array(readbuffer(f));
      }
      data = read(f, 'binary');
      assert(typeof data == 'object');
      return data;
    };

    readAsync = function readAsync(f, onload, onerror) {
      setTimeout(() => onload(readBinary(f)), 0);
    };

    if (typeof scriptArgs != 'undefined') {
      arguments_ = scriptArgs;
    } else if (typeof arguments != 'undefined') {
      arguments_ = arguments;
    }

    if (typeof quit == 'function') {
      quit_ = (status, toThrow) => {
        logExceptionOnExit(toThrow);
        quit(status);
      };
    }

    if (typeof print != 'undefined') {
      // Prefer to use print/printErr where they exist, as they usually work better.
      if (typeof console == 'undefined') console = /** @type{!Console} */({});
      console.log = /** @type{!function(this:Console, ...*): undefined} */ (print);
      console.warn = console.error = /** @type{!function(this:Console, ...*): undefined} */ (typeof printErr != 'undefined' ? printErr : print);
    }

  } else

    // Note that this includes Node.js workers when relevant (pthreads is enabled).
    // Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
    // ENVIRONMENT_IS_NODE.
    if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
        scriptDirectory = self.location.href;
      } else if (typeof document != 'undefined' && document.currentScript) { // web
        scriptDirectory = document.currentScript.src;
      }
      // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
      // otherwise, slice off the final part of the url to find the script directory.
      // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
      // and scriptDirectory will correctly be replaced with an empty string.
      // If scriptDirectory contains a query (starting with ?) or a fragment (starting with #),
      // they are removed because they could contain a slash.
      if (scriptDirectory.indexOf('blob:') !== 0) {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf('/') + 1);
      } else {
        scriptDirectory = '';
      }

      if (!(typeof window == 'object' || typeof importScripts == 'function')) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

      // Differentiate the Web Worker from the Node Worker case, as reading must
      // be done differently.
      {
        // include: web_or_worker_shell_read.js


        read_ = (url) => {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, false);
          xhr.send(null);
          return xhr.responseText;
        }

        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.responseType = 'arraybuffer';
            xhr.send(null);
            return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
          };
        }

        readAsync = (url, onload, onerror) => {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => {
            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
              onload(xhr.response);
              return;
            }
            onerror();
          };
          xhr.onerror = onerror;
          xhr.send(null);
        }

        // end include: web_or_worker_shell_read.js
      }

      setWindowTitle = (title) => document.title = title;
    } else {
      throw new Error('environment detection error');
    }

var out = Module['print'] || console.log.bind(console);
var err = Module['printErr'] || console.warn.bind(console);

// Merge back in the overrides
Object.assign(Module, moduleOverrides);
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = null;

// Emit code to handle expected values on the Module object. This applies Module.x
// to the proper local x. This has two benefits: first, we only emit it if it is
// expected to arrive, and second, by using a local everywhere else that can be
// minified.

if (Module['arguments']) arguments_ = Module['arguments'];
if (!Object.getOwnPropertyDescriptor(Module, 'arguments')) {
  Object.defineProperty(Module, 'arguments', {
    configurable: true,
    get: function () {
      abort('Module.arguments has been replaced with plain arguments_ (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (Module['thisProgram']) thisProgram = Module['thisProgram'];
if (!Object.getOwnPropertyDescriptor(Module, 'thisProgram')) {
  Object.defineProperty(Module, 'thisProgram', {
    configurable: true,
    get: function () {
      abort('Module.thisProgram has been replaced with plain thisProgram (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (Module['quit']) quit_ = Module['quit'];
if (!Object.getOwnPropertyDescriptor(Module, 'quit')) {
  Object.defineProperty(Module, 'quit', {
    configurable: true,
    get: function () {
      abort('Module.quit has been replaced with plain quit_ (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
// Assertions on removed incoming Module JS APIs.
assert(typeof Module['memoryInitializerPrefixURL'] == 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['pthreadMainPrefixURL'] == 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['cdInitializerPrefixURL'] == 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['filePackagePrefixURL'] == 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['read'] == 'undefined', 'Module.read option was removed (modify read_ in JS)');
assert(typeof Module['readAsync'] == 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
assert(typeof Module['readBinary'] == 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
assert(typeof Module['setWindowTitle'] == 'undefined', 'Module.setWindowTitle option was removed (modify setWindowTitle in JS)');
assert(typeof Module['TOTAL_MEMORY'] == 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');

if (!Object.getOwnPropertyDescriptor(Module, 'read')) {
  Object.defineProperty(Module, 'read', {
    configurable: true,
    get: function () {
      abort('Module.read has been replaced with plain read_ (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (!Object.getOwnPropertyDescriptor(Module, 'readAsync')) {
  Object.defineProperty(Module, 'readAsync', {
    configurable: true,
    get: function () {
      abort('Module.readAsync has been replaced with plain readAsync (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (!Object.getOwnPropertyDescriptor(Module, 'readBinary')) {
  Object.defineProperty(Module, 'readBinary', {
    configurable: true,
    get: function () {
      abort('Module.readBinary has been replaced with plain readBinary (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (!Object.getOwnPropertyDescriptor(Module, 'setWindowTitle')) {
  Object.defineProperty(Module, 'setWindowTitle', {
    configurable: true,
    get: function () {
      abort('Module.setWindowTitle has been replaced with plain setWindowTitle (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}
var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';


assert(!ENVIRONMENT_IS_SHELL, "shell environment detected but not enabled at build time.  Add 'shell' to `-s ENVIRONMENT` to enable.");




var STACK_ALIGN = 16;
var POINTER_SIZE = 4;

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length - 1] === '*') {
        return POINTER_SIZE;
      } else if (type[0] === 'i') {
        const bits = Number(type.substr(1));
        assert(bits % 8 === 0, 'getNativeTypeSize invalid bits ' + bits + ', type ' + type);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    err(text);
  }
}

// include: runtime_functions.js


// Wraps a JS function as a wasm function with a given signature.
function convertJsFunctionToWasm(func, sig) {

  // If the type reflection proposal is available, use the new
  // "WebAssembly.Function" constructor.
  // Otherwise, construct a minimal wasm module importing the JS function and
  // re-exporting it.
  if (typeof WebAssembly.Function == "function") {
    var typeNames = {
      'i': 'i32',
      'j': 'i64',
      'f': 'f32',
      'd': 'f64'
    };
    var type = {
      parameters: [],
      results: sig[0] == 'v' ? [] : [typeNames[sig[0]]]
    };
    for (var i = 1; i < sig.length; ++i) {
      type.parameters.push(typeNames[sig[i]]);
    }
    return new WebAssembly.Function(type, func);
  }

  // The module is static, with the exception of the type section, which is
  // generated based on the signature passed in.
  var typeSection = [
    0x01, // id: section,
    0x00, // length: 0 (placeholder)
    0x01, // count: 1
    0x60, // form: func
  ];
  var sigRet = sig.slice(0, 1);
  var sigParam = sig.slice(1);
  var typeCodes = {
    'i': 0x7f, // i32
    'j': 0x7e, // i64
    'f': 0x7d, // f32
    'd': 0x7c, // f64
  };

  // Parameters, length + signatures
  typeSection.push(sigParam.length);
  for (var i = 0; i < sigParam.length; ++i) {
    typeSection.push(typeCodes[sigParam[i]]);
  }

  // Return values, length + signatures
  // With no multi-return in MVP, either 0 (void) or 1 (anything else)
  if (sigRet == 'v') {
    typeSection.push(0x00);
  } else {
    typeSection = typeSection.concat([0x01, typeCodes[sigRet]]);
  }

  // Write the overall length of the type section back into the section header
  // (excepting the 2 bytes for the section id and length)
  typeSection[1] = typeSection.length - 2;

  // Rest of the module is static
  var bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // magic ("\0asm")
    0x01, 0x00, 0x00, 0x00, // version: 1
  ].concat(typeSection, [
    0x02, 0x07, // import section
    // (import "e" "f" (func 0 (type 0)))
    0x01, 0x01, 0x65, 0x01, 0x66, 0x00, 0x00,
    0x07, 0x05, // export section
    // (export "f" (func 0 (type 0)))
    0x01, 0x01, 0x66, 0x00, 0x00,
  ]));

  // We can compile this wasm module synchronously because it is very small.
  // This accepts an import (at "e.f"), that it reroutes to an export (at "f")
  var module = new WebAssembly.Module(bytes);
  var instance = new WebAssembly.Instance(module, {
    'e': {
      'f': func
    }
  });
  var wrappedFunc = instance.exports['f'];
  return wrappedFunc;
}

var freeTableIndexes = [];

// Weak map of functions in the table to their indexes, created on first use.
var functionsInTableMap;

function getEmptyTableSlot() {
  // Reuse a free index if there is one, otherwise grow.
  if (freeTableIndexes.length) {
    return freeTableIndexes.pop();
  }
  // Grow the table
  try {
    wasmTable.grow(1);
  } catch (err) {
    if (!(err instanceof RangeError)) {
      throw err;
    }
    throw 'Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.';
  }
  return wasmTable.length - 1;
}

function updateTableMap(offset, count) {
  for (var i = offset; i < offset + count; i++) {
    var item = getWasmTableEntry(i);
    // Ignore null values.
    if (item) {
      functionsInTableMap.set(item, i);
    }
  }
}

/**
 * Add a function to the table.
 * 'sig' parameter is required if the function being added is a JS function.
 * @param {string=} sig
 */
function addFunction(func, sig) {
  assert(typeof func != 'undefined');

  // Check if the function is already in the table, to ensure each function
  // gets a unique index. First, create the map if this is the first use.
  if (!functionsInTableMap) {
    functionsInTableMap = new WeakMap();
    updateTableMap(0, wasmTable.length);
  }
  if (functionsInTableMap.has(func)) {
    return functionsInTableMap.get(func);
  }

  // It's not in the table, add it now.

  var ret = getEmptyTableSlot();

  // Set the new value.
  try {
    // Attempting to call this with JS function will cause of table.set() to fail
    setWasmTableEntry(ret, func);
  } catch (err) {
    if (!(err instanceof TypeError)) {
      throw err;
    }
    assert(typeof sig != 'undefined', 'Missing signature argument to addFunction: ' + func);
    var wrapped = convertJsFunctionToWasm(func, sig);
    setWasmTableEntry(ret, wrapped);
  }

  functionsInTableMap.set(func, ret);

  return ret;
}

function removeFunction(index) {
  functionsInTableMap.delete(getWasmTableEntry(index));
  freeTableIndexes.push(index);
}

// end include: runtime_functions.js
// include: runtime_debug.js


// end include: runtime_debug.js
var tempRet0 = 0;
var setTempRet0 = (value) => { tempRet0 = value; };
var getTempRet0 = () => tempRet0;



// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary;
if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];
if (!Object.getOwnPropertyDescriptor(Module, 'wasmBinary')) {
  Object.defineProperty(Module, 'wasmBinary', {
    configurable: true,
    get: function () {
      abort('Module.wasmBinary has been replaced with plain wasmBinary (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}
var noExitRuntime = Module['noExitRuntime'] || true;
if (!Object.getOwnPropertyDescriptor(Module, 'noExitRuntime')) {
  Object.defineProperty(Module, 'noExitRuntime', {
    configurable: true,
    get: function () {
      abort('Module.noExitRuntime has been replaced with plain noExitRuntime (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

if (typeof WebAssembly != 'object') {
  abort('no native wasm support detected');
}

// include: runtime_safe_heap.js


// In MINIMAL_RUNTIME, setValue() and getValue() are only available when building with safe heap enabled, for heap safety checking.
// In traditional runtime, setValue() and getValue() are always available (although their use is highly discouraged due to perf penalties)

/** @param {number} ptr
    @param {number} value
    @param {string} type
    @param {number|boolean=} noSafe */
function setValue(ptr, value, type = 'i8', noSafe) {
  if (type.charAt(type.length - 1) === '*') type = 'i32';
  switch (type) {
    case 'i1': HEAP8[((ptr) >> 0)] = value; break;
    case 'i8': HEAP8[((ptr) >> 0)] = value; break;
    case 'i16': HEAP16[((ptr) >> 1)] = value; break;
    case 'i32': HEAP32[((ptr) >> 2)] = value; break;
    case 'i64': (tempI64 = [value >>> 0, (tempDouble = value, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math.min((+(Math.floor((tempDouble) / 4294967296.0))), 4294967295.0)) | 0) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[((ptr) >> 2)] = tempI64[0], HEAP32[(((ptr) + (4)) >> 2)] = tempI64[1]); break;
    case 'float': HEAPF32[((ptr) >> 2)] = value; break;
    case 'double': HEAPF64[((ptr) >> 3)] = value; break;
    default: abort('invalid type for setValue: ' + type);
  }
}

/** @param {number} ptr
    @param {string} type
    @param {number|boolean=} noSafe */
function getValue(ptr, type = 'i8', noSafe) {
  if (type.charAt(type.length - 1) === '*') type = 'i32';
  switch (type) {
    case 'i1': return HEAP8[((ptr) >> 0)];
    case 'i8': return HEAP8[((ptr) >> 0)];
    case 'i16': return HEAP16[((ptr) >> 1)];
    case 'i32': return HEAP32[((ptr) >> 2)];
    case 'i64': return HEAP32[((ptr) >> 2)];
    case 'float': return HEAPF32[((ptr) >> 2)];
    case 'double': return Number(HEAPF64[((ptr) >> 3)]);
    default: abort('invalid type for getValue: ' + type);
  }
  return null;
}

// end include: runtime_safe_heap.js
// Wasm globals

var wasmMemory;

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

// C calling interface.
/** @param {string|null=} returnType
    @param {Array=} argTypes
    @param {Arguments|Array=} args
    @param {Object=} opts */
function ccall(ident, returnType, argTypes, args, opts) {
  // For fast lookup of conversion functions
  var toC = {
    'string': function (str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    },
    'array': function (arr) {
      var ret = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    }
  };

  function convertReturnValue(ret) {
    if (returnType === 'string') return UTF8ToString(ret);
    if (returnType === 'boolean') return Boolean(ret);
    return ret;
  }

  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  function onDone(ret) {
    runtimeKeepalivePop();
    if (stack !== 0) stackRestore(stack);
    return convertReturnValue(ret);
  }
  runtimeKeepalivePush();
  var asyncMode = opts && opts.async;
  // Check if we started an async operation just now.
  if (Asyncify.currData) {
    // If so, the WASM function ran asynchronous and unwound its stack.
    // We need to return a Promise that resolves the return value
    // once the stack is rewound and execution finishes.
    assert(asyncMode, 'The call to ' + ident + ' is running asynchronously. If this was intended, add the async option to the ccall/cwrap call.');
    return Asyncify.whenDone().then(onDone);
  }

  ret = onDone(ret);
  // If this is an async ccall, ensure we return a promise
  if (asyncMode) return Promise.resolve(ret);
  return ret;
}

/** @param {string=} returnType
    @param {Array=} argTypes
    @param {Object=} opts */
function cwrap(ident, returnType, argTypes, opts) {
  return function () {
    return ccall(ident, returnType, argTypes, arguments, opts);
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.

// include: runtime_legacy.js


var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call

/**
 * allocate(): This function is no longer used by emscripten but is kept around to avoid
 *             breaking external users.
 *             You should normally not use allocate(), and instead allocate
 *             memory using _malloc()/stackAlloc(), initialize it with
 *             setValue(), and so forth.
 * @param {(Uint8Array|Array<number>)} slab: An array of data.
 * @param {number=} allocator : How to allocate memory, see ALLOC_*
 */
function allocate(slab, allocator) {
  var ret;
  assert(typeof allocator == 'number', 'allocate no longer takes a type argument')
  assert(typeof slab != 'number', 'allocate no longer takes a number as arg0')

  if (allocator == ALLOC_STACK) {
    ret = stackAlloc(slab.length);
  } else {
    ret = _malloc(slab.length);
  }

  if (!slab.subarray && !slab.slice) {
    slab = new Uint8Array(slab);
  }
  HEAPU8.set(slab, ret);
  return ret;
}

// end include: runtime_legacy.js
// include: runtime_strings.js


// runtime_strings.js: Strings related runtime functions that are part of both MINIMAL_RUNTIME and regular runtime.

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder('utf8') : undefined;

/**
 * @param {number} idx
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ArrayToString(heap, idx, maxBytesToRead) {
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation, so that undefined means Infinity)
  while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;

  if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(heap.subarray(idx, endPtr));
  } else {
    var str = '';
    // If building with TextDecoder, we have already computed the string length above, so test loop end condition against that
    while (idx < endPtr) {
      // For UTF8 byte structure, see:
      // http://en.wikipedia.org/wiki/UTF-8#Description
      // https://www.ietf.org/rfc/rfc2279.txt
      // https://tools.ietf.org/html/rfc3629
      var u0 = heap[idx++];
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      var u1 = heap[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      var u2 = heap[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        if ((u0 & 0xF8) != 0xF0) warnOnce('Invalid UTF-8 leading byte 0x' + u0.toString(16) + ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!');
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heap[idx++] & 63);
      }

      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
  return str;
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns a
// copy of that string as a Javascript String object.
// maxBytesToRead: an optional length that specifies the maximum number of bytes to read. You can omit
//                 this parameter to scan the string until the first \0 byte. If maxBytesToRead is
//                 passed, and the string at [ptr, ptr+maxBytesToReadr[ contains a null byte in the
//                 middle, then the string will cut short at that byte index (i.e. maxBytesToRead will
//                 not produce a string of exact length [ptr, ptr+maxBytesToRead[)
//                 N.B. mixing frequent uses of UTF8ToString() with and without maxBytesToRead may
//                 throw JS JIT optimizations off, so it is worth to consider consistently using one
//                 style or the other.
/**
 * @param {number} ptr
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ToString(ptr, maxBytesToRead) {
  ;
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   heap: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array.
//                    This count should include the null terminator,
//                    i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) {
      var u1 = str.charCodeAt(++i);
      u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
    }
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      heap[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      heap[outIdx++] = 0xC0 | (u >> 6);
      heap[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      heap[outIdx++] = 0xE0 | (u >> 12);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      if (u > 0x10FFFF) warnOnce('Invalid Unicode code point 0x' + u.toString(16) + ' encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).');
      heap[outIdx++] = 0xF0 | (u >> 18);
      heap[outIdx++] = 0x80 | ((u >> 12) & 63);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  heap[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.
function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) ++len;
    else if (u <= 0x7FF) len += 2;
    else if (u <= 0xFFFF) len += 3;
    else len += 4;
  }
  return len;
}

// end include: runtime_strings.js
// include: runtime_strings_extra.js


// runtime_strings_extra.js: Strings related runtime functions that are available only in regular runtime.

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAPU8[((ptr++) >> 0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder('utf-16le') : undefined;

function UTF16ToString(ptr, maxBytesToRead) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  var maxIdx = idx + maxBytesToRead / 2;
  // If maxBytesToRead is not passed explicitly, it will be undefined, and this
  // will always evaluate to true. This saves on code size.
  while (!(idx >= maxIdx) && HEAPU16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var str = '';

    // If maxBytesToRead is not passed explicitly, it will be undefined, and the for-loop's condition
    // will always evaluate to true. The loop is then terminated on the first null char.
    for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
      var codeUnit = HEAP16[(((ptr) + (i * 2)) >> 1)];
      if (codeUnit == 0) break;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }

    return str;
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length * 2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr) >> 1)] = codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr) >> 1)] = 0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length * 2;
}

function UTF32ToString(ptr, maxBytesToRead) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  // If maxBytesToRead is not passed explicitly, it will be undefined, and this
  // will always evaluate to true. This saves on code size.
  while (!(i >= maxBytesToRead / 4)) {
    var utf32 = HEAP32[(((ptr) + (i * 4)) >> 2)];
    if (utf32 == 0) break;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
  return str;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr) >> 2)] = codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr) >> 2)] = 0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated
    @param {boolean=} dontAddNull */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

/** @param {boolean=} dontAddNull */
function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === (str.charCodeAt(i) & 0xff));
    HEAP8[((buffer++) >> 0)] = str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer) >> 0)] = 0;
}

// end include: runtime_strings_extra.js
// Memory management

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
  /** @type {ArrayBuffer} */
  buffer,
  /** @type {Int8Array} */
  HEAP8,
  /** @type {Uint8Array} */
  HEAPU8,
  /** @type {Int16Array} */
  HEAP16,
  /** @type {Uint16Array} */
  HEAPU16,
  /** @type {Int32Array} */
  HEAP32,
  /** @type {Uint32Array} */
  HEAPU32,
  /** @type {Float32Array} */
  HEAPF32,
  /** @type {Float64Array} */
  HEAPF64;

function updateGlobalBufferAndViews(buf) {
  buffer = buf;
  Module['HEAP8'] = HEAP8 = new Int8Array(buf);
  Module['HEAP16'] = HEAP16 = new Int16Array(buf);
  Module['HEAP32'] = HEAP32 = new Int32Array(buf);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buf);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buf);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buf);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buf);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buf);
}

var TOTAL_STACK = 5242880;
if (Module['TOTAL_STACK']) assert(TOTAL_STACK === Module['TOTAL_STACK'], 'the stack size can no longer be determined at runtime')

var INITIAL_MEMORY = Module['INITIAL_MEMORY'] || 16777216;
if (!Object.getOwnPropertyDescriptor(Module, 'INITIAL_MEMORY')) {
  Object.defineProperty(Module, 'INITIAL_MEMORY', {
    configurable: true,
    get: function () {
      abort('Module.INITIAL_MEMORY has been replaced with plain INITIAL_MEMORY (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)')
    }
  });
}

assert(INITIAL_MEMORY >= TOTAL_STACK, 'INITIAL_MEMORY should be larger than TOTAL_STACK, was ' + INITIAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array != 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray != undefined && Int32Array.prototype.set != undefined,
  'JS engine does not provide full typed array support');

// If memory is defined in wasm, the user can't provide it.
assert(!Module['wasmMemory'], 'Use of `wasmMemory` detected.  Use -s IMPORTED_MEMORY to define wasmMemory externally');
assert(INITIAL_MEMORY == 16777216, 'Detected runtime INITIAL_MEMORY setting.  Use -s IMPORTED_MEMORY to define wasmMemory dynamically');

// include: runtime_init_table.js
// In regular non-RELOCATABLE mode the table is exported
// from the wasm module and this will be assigned once
// the exports are available.
var wasmTable;

// end include: runtime_init_table.js
// include: runtime_stack_check.js


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // The stack grows downwards
  HEAP32[((max + 4) >> 2)] = 0x2135467;
  HEAP32[((max + 8) >> 2)] = 0x89BACDFE;
  // Also test the global address 0 for integrity.
  HEAP32[0] = 0x63736d65; /* 'emsc' */
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  var cookie1 = HEAPU32[((max + 4) >> 2)];
  var cookie2 = HEAPU32[((max + 8) >> 2)];
  if (cookie1 != 0x2135467 || cookie2 != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x2135467, but received 0x' + cookie2.toString(16) + ' 0x' + cookie1.toString(16));
  }
  // Also test the global address 0 for integrity.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
}

// end include: runtime_stack_check.js
// include: runtime_assertions.js


// Endianness check
(function () {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) throw 'Runtime error: expected the system to be little-endian! (Run with -s SUPPORT_BIG_ENDIAN=1 to bypass)';
})();

// end include: runtime_assertions.js
var __ATPRERUN__ = []; // functions called before the runtime is initialized
var __ATINIT__ = []; // functions called during startup
var __ATMAIN__ = []; // functions called when main() is to be run
var __ATEXIT__ = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;
var runtimeExited = false;
var runtimeKeepaliveCounter = 0;

function keepRuntimeAlive() {
  return noExitRuntime || runtimeKeepaliveCounter > 0;
}

function preRun() {

  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }

  callRuntimeCallbacks(__ATPRERUN__);
}

function initRuntime() {
  checkStackCookie();
  assert(!runtimeInitialized);
  runtimeInitialized = true;


  if (!Module["noFSInit"] && !FS.init.initialized)
    FS.init();
  FS.ignorePermissions = false;

  TTY.init();
  SOCKFS.root = FS.mount(SOCKFS, {}, null);
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();

  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  // ASYNCIFY cannot be used once the runtime starts shutting down.
  Asyncify.state = Asyncify.State.Disabled;
  checkStackCookie();
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();

  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }

  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// include: runtime_math.js


// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc

assert(Math.imul, 'This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.fround, 'This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.clz32, 'This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.trunc, 'This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');

// end include: runtime_math.js
// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
}

function addRunDependency(id) {
  runDependencies++;

  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }

  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval != 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function () {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err('still waiting on run dependencies:');
          }
          err('dependency: ' + dep);
        }
        if (shown) {
          err('(end of list)');
        }
      }, 10000);
    }
  } else {
    err('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;

  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }

  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data

/** @param {string|number=} what */
function abort(what) {
  {
    if (Module['onAbort']) {
      Module['onAbort'](what);
    }
  }

  what = 'Aborted(' + what + ')';
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;
  EXITSTATUS = 1;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // defintion for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.

  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

// {{MEM_INITIALIZER}}

// include: memoryprofiler.js


// end include: memoryprofiler.js
// include: URIUtils.js


// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  // Prefix of data URIs emitted by SINGLE_FILE and related options.
  return filename.startsWith(dataURIPrefix);
}

// Indicates whether filename is delivered via file protocol (as opposed to http/https)
function isFileURI(filename) {
  return filename.startsWith('file://');
}

// end include: URIUtils.js
/** @param {boolean=} fixedasm */
function createExportWrapper(name, fixedasm) {
  return function () {
    var displayName = name;
    var asm = fixedasm;
    if (!fixedasm) {
      asm = Module['asm'];
    }
    assert(runtimeInitialized, 'native function `' + displayName + '` called before runtime initialization');
    assert(!runtimeExited, 'native function `' + displayName + '` called after runtime exit (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
    if (!asm[name]) {
      assert(asm[name], 'exported native function `' + displayName + '` not found');
    }
    return asm[name].apply(null, arguments);
  };
}

var wasmBinaryFile;
wasmBinaryFile = 'chocolate-doom.wasm';
if (!isDataURI(wasmBinaryFile)) {
  wasmBinaryFile = locateFile(wasmBinaryFile);
}

function getBinary(file) {
  try {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    if (readBinary) {
      return readBinary(file);
    } else {
      throw "both async and sync fetching of the wasm failed";
    }
  }
  catch (err) {
    abort(err);
  }
}

function getBinaryPromise() {
  // If we don't have the binary yet, try to to load it asynchronously.
  // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
  // See https://github.com/github/fetch/pull/92#issuecomment-140665932
  // Cordova or Electron apps are typically loaded from a file:// url.
  // So use fetch if it is available and the url is not a file, otherwise fall back to XHR.
  if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
    if (typeof fetch == 'function'
      && !isFileURI(wasmBinaryFile)
    ) {
      return fetch(wasmBinaryFile, { credentials: 'same-origin' }).then(function (response) {
        if (!response['ok']) {
          throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
        }
        return response['arrayBuffer']();
      }).catch(function () {
        return getBinary(wasmBinaryFile);
      });
    }
    else {
      if (readAsync) {
        // fetch is not available or url is file => try XHR (readAsync uses XHR internally)
        return new Promise(function (resolve, reject) {
          readAsync(wasmBinaryFile, function (response) { resolve(new Uint8Array(/** @type{!ArrayBuffer} */(response))) }, reject)
        });
      }
    }
  }

  // Otherwise, getBinary should be able to get it synchronously
  return Promise.resolve().then(function () { return getBinary(wasmBinaryFile); });
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
function createWasm() {
  // prepare imports
  var info = {
    'env': asmLibraryArg,
    'wasi_snapshot_preview1': asmLibraryArg,
  };
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/
  function receiveInstance(instance, module) {
    var exports = instance.exports;

    exports = Asyncify.instrumentWasmExports(exports);

    Module['asm'] = exports;

    wasmMemory = Module['asm']['memory'];
    assert(wasmMemory, "memory not found in wasm exports");
    // This assertion doesn't hold when emscripten is run in --post-link
    // mode.
    // TODO(sbc): Read INITIAL_MEMORY out of the wasm file in post-link mode.
    //assert(wasmMemory.buffer.byteLength === 16777216);
    updateGlobalBufferAndViews(wasmMemory.buffer);

    wasmTable = Module['asm']['__indirect_function_table'];
    assert(wasmTable, "table not found in wasm exports");

    addOnInit(Module['asm']['__wasm_call_ctors']);

    removeRunDependency('wasm-instantiate');
  }
  // we can't run yet (except in a pthread, where we have a custom sync instantiator)
  addRunDependency('wasm-instantiate');

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above USE_PTHREADS-enabled path.
    receiveInstance(result['instance']);
  }

  function instantiateArrayBuffer(receiver) {
    return getBinaryPromise().then(function (binary) {
      return WebAssembly.instantiate(binary, info);
    }).then(function (instance) {
      return instance;
    }).then(receiver, function (reason) {
      err('failed to asynchronously prepare wasm: ' + reason);

      // Warn on some common problems.
      if (isFileURI(wasmBinaryFile)) {
        err('warning: Loading from a file URI (' + wasmBinaryFile + ') is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing');
      }
      abort(reason);
    });
  }

  function instantiateAsync() {
    if (!wasmBinary &&
      typeof WebAssembly.instantiateStreaming == 'function' &&
      !isDataURI(wasmBinaryFile) &&
      // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
      !isFileURI(wasmBinaryFile) &&
      typeof fetch == 'function') {
      return fetch(wasmBinaryFile, { credentials: 'same-origin' }).then(function (response) {
        // Suppress closure warning here since the upstream definition for
        // instantiateStreaming only allows Promise<Repsponse> rather than
        // an actual Response.
        // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure is fixed.
        /** @suppress {checkTypes} */
        var result = WebAssembly.instantiateStreaming(response, info);

        return result.then(
          receiveInstantiationResult,
          function (reason) {
            // We expect the most common failure cause to be a bad MIME type for the binary,
            // in which case falling back to ArrayBuffer instantiation should work.
            err('wasm streaming compile failed: ' + reason);
            err('falling back to ArrayBuffer instantiation');
            return instantiateArrayBuffer(receiveInstantiationResult);
          });
      });
    } else {
      return instantiateArrayBuffer(receiveInstantiationResult);
    }
  }

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to run the instantiation parallel
  // to any other async startup actions they are performing.
  if (Module['instantiateWasm']) {
    try {
      var exports = Module['instantiateWasm'](info, receiveInstance);
      exports = Asyncify.instrumentWasmExports(exports);
      return exports;
    } catch (e) {
      err('Module.instantiateWasm callback failed with error: ' + e);
      return false;
    }
  }

  instantiateAsync();
  return {}; // no exports yet; we'll fill them in later
}

// Globals used by JS i64 conversions (see makeSetValue)
var tempDouble;
var tempI64;

// === Body ===

var ASM_CONSTS = {
  429968: function ($0) { var str = UTF8ToString($0) + '\n\n' + 'Abort/Retry/Ignore/AlwaysIgnore? [ariA] :'; var reply = window.prompt(str, "i"); if (reply === null) { reply = "i"; } return allocate(intArrayFromString(reply), 'i8', ALLOC_NORMAL); },
  430193: function () { if (typeof (AudioContext) !== 'undefined') { return 1; } else if (typeof (webkitAudioContext) !== 'undefined') { return 1; } return 0; },
  430330: function () { if ((typeof (navigator.mediaDevices) !== 'undefined') && (typeof (navigator.mediaDevices.getUserMedia) !== 'undefined')) { return 1; } else if (typeof (navigator.webkitGetUserMedia) !== 'undefined') { return 1; } return 0; },
  430554: function ($0) { if (typeof (Module['SDL2']) === 'undefined') { Module['SDL2'] = {}; } var SDL2 = Module['SDL2']; if (!$0) { SDL2.audio = {}; } else { SDL2.capture = {}; } if (!SDL2.audioContext) { if (typeof (AudioContext) !== 'undefined') { SDL2.audioContext = new AudioContext(); } else if (typeof (webkitAudioContext) !== 'undefined') { SDL2.audioContext = new webkitAudioContext(); } if (SDL2.audioContext) { autoResumeAudioContext(SDL2.audioContext); } } return SDL2.audioContext === undefined ? -1 : 0; },
  431047: function () { var SDL2 = Module['SDL2']; return SDL2.audioContext.sampleRate; },
  431115: function ($0, $1, $2, $3) { var SDL2 = Module['SDL2']; var have_microphone = function (stream) { if (SDL2.capture.silenceTimer !== undefined) { clearTimeout(SDL2.capture.silenceTimer); SDL2.capture.silenceTimer = undefined; } SDL2.capture.mediaStreamNode = SDL2.audioContext.createMediaStreamSource(stream); SDL2.capture.scriptProcessorNode = SDL2.audioContext.createScriptProcessor($1, $0, 1); SDL2.capture.scriptProcessorNode.onaudioprocess = function (audioProcessingEvent) { if ((SDL2 === undefined) || (SDL2.capture === undefined)) { return; } audioProcessingEvent.outputBuffer.getChannelData(0).fill(0.0); SDL2.capture.currentCaptureBuffer = audioProcessingEvent.inputBuffer; dynCall('vi', $2, [$3]); }; SDL2.capture.mediaStreamNode.connect(SDL2.capture.scriptProcessorNode); SDL2.capture.scriptProcessorNode.connect(SDL2.audioContext.destination); SDL2.capture.stream = stream; }; var no_microphone = function (error) { }; SDL2.capture.silenceBuffer = SDL2.audioContext.createBuffer($0, $1, SDL2.audioContext.sampleRate); SDL2.capture.silenceBuffer.getChannelData(0).fill(0.0); var silence_callback = function () { SDL2.capture.currentCaptureBuffer = SDL2.capture.silenceBuffer; dynCall('vi', $2, [$3]); }; SDL2.capture.silenceTimer = setTimeout(silence_callback, ($1 / SDL2.audioContext.sampleRate) * 1000); if ((navigator.mediaDevices !== undefined) && (navigator.mediaDevices.getUserMedia !== undefined)) { navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(have_microphone).catch(no_microphone); } else if (navigator.webkitGetUserMedia !== undefined) { navigator.webkitGetUserMedia({ audio: true, video: false }, have_microphone, no_microphone); } },
  432767: function ($0, $1, $2, $3) { var SDL2 = Module['SDL2']; SDL2.audio.scriptProcessorNode = SDL2.audioContext['createScriptProcessor']($1, 0, $0); SDL2.audio.scriptProcessorNode['onaudioprocess'] = function (e) { if ((SDL2 === undefined) || (SDL2.audio === undefined)) { return; } SDL2.audio.currentOutputBuffer = e['outputBuffer']; dynCall('vi', $2, [$3]); }; SDL2.audio.scriptProcessorNode['connect'](SDL2.audioContext['destination']); },
  433177: function ($0, $1) { var SDL2 = Module['SDL2']; var numChannels = SDL2.capture.currentCaptureBuffer.numberOfChannels; for (var c = 0; c < numChannels; ++c) { var channelData = SDL2.capture.currentCaptureBuffer.getChannelData(c); if (channelData.length != $1) { throw 'Web Audio capture buffer length mismatch! Destination size: ' + channelData.length + ' samples vs expected ' + $1 + ' samples!'; } if (numChannels == 1) { for (var j = 0; j < $1; ++j) { setValue($0 + (j * 4), channelData[j], 'float'); } } else { for (var j = 0; j < $1; ++j) { setValue($0 + (((j * numChannels) + c) * 4), channelData[j], 'float'); } } } },
  433782: function ($0, $1) { var SDL2 = Module['SDL2']; var numChannels = SDL2.audio.currentOutputBuffer['numberOfChannels']; for (var c = 0; c < numChannels; ++c) { var channelData = SDL2.audio.currentOutputBuffer['getChannelData'](c); if (channelData.length != $1) { throw 'Web Audio output buffer length mismatch! Destination size: ' + channelData.length + ' samples vs expected ' + $1 + ' samples!'; } for (var j = 0; j < $1; ++j) { channelData[j] = HEAPF32[$0 + ((j * numChannels + c) << 2) >> 2]; } } },
  434262: function ($0) { var SDL2 = Module['SDL2']; if ($0) { if (SDL2.capture.silenceTimer !== undefined) { clearTimeout(SDL2.capture.silenceTimer); } if (SDL2.capture.stream !== undefined) { var tracks = SDL2.capture.stream.getAudioTracks(); for (var i = 0; i < tracks.length; i++) { SDL2.capture.stream.removeTrack(tracks[i]); } SDL2.capture.stream = undefined; } if (SDL2.capture.scriptProcessorNode !== undefined) { SDL2.capture.scriptProcessorNode.onaudioprocess = function (audioProcessingEvent) { }; SDL2.capture.scriptProcessorNode.disconnect(); SDL2.capture.scriptProcessorNode = undefined; } if (SDL2.capture.mediaStreamNode !== undefined) { SDL2.capture.mediaStreamNode.disconnect(); SDL2.capture.mediaStreamNode = undefined; } if (SDL2.capture.silenceBuffer !== undefined) { SDL2.capture.silenceBuffer = undefined } SDL2.capture = undefined; } else { if (SDL2.audio.scriptProcessorNode != undefined) { SDL2.audio.scriptProcessorNode.disconnect(); SDL2.audio.scriptProcessorNode = undefined; } SDL2.audio = undefined; } if ((SDL2.audioContext !== undefined) && (SDL2.audio === undefined) && (SDL2.capture === undefined)) { SDL2.audioContext.close(); SDL2.audioContext = undefined; } },
  435434: function ($0, $1, $2) { var w = $0; var h = $1; var pixels = $2; if (!Module['SDL2']) Module['SDL2'] = {}; var SDL2 = Module['SDL2']; if (SDL2.ctxCanvas !== Module['canvas']) { SDL2.ctx = Module['createContext'](Module['canvas'], false, true); SDL2.ctxCanvas = Module['canvas']; } if (SDL2.w !== w || SDL2.h !== h || SDL2.imageCtx !== SDL2.ctx) { SDL2.image = SDL2.ctx.createImageData(w, h); SDL2.w = w; SDL2.h = h; SDL2.imageCtx = SDL2.ctx; } var data = SDL2.image.data; var src = pixels >> 2; var dst = 0; var num; if (typeof CanvasPixelArray !== 'undefined' && data instanceof CanvasPixelArray) { num = data.length; while (dst < num) { var val = HEAP32[src]; data[dst] = val & 0xff; data[dst + 1] = (val >> 8) & 0xff; data[dst + 2] = (val >> 16) & 0xff; data[dst + 3] = 0xff; src++; dst += 4; } } else { if (SDL2.data32Data !== data) { SDL2.data32 = new Int32Array(data.buffer); SDL2.data8 = new Uint8Array(data.buffer); SDL2.data32Data = data; } var data32 = SDL2.data32; num = data32.length; data32.set(HEAP32.subarray(src, src + num)); var data8 = SDL2.data8; var i = 3; var j = i + 4 * num; if (num % 8 == 0) { while (i < j) { data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; data8[i] = 0xff; i = i + 4 | 0; } } else { while (i < j) { data8[i] = 0xff; i = i + 4 | 0; } } } SDL2.ctx.putImageData(SDL2.image, 0, 0); return 0; },
  436913: function ($0, $1, $2, $3, $4) { var w = $0; var h = $1; var hot_x = $2; var hot_y = $3; var pixels = $4; var canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; var ctx = canvas.getContext("2d"); var image = ctx.createImageData(w, h); var data = image.data; var src = pixels >> 2; var dst = 0; var num; if (typeof CanvasPixelArray !== 'undefined' && data instanceof CanvasPixelArray) { num = data.length; while (dst < num) { var val = HEAP32[src]; data[dst] = val & 0xff; data[dst + 1] = (val >> 8) & 0xff; data[dst + 2] = (val >> 16) & 0xff; data[dst + 3] = (val >> 24) & 0xff; src++; dst += 4; } } else { var data32 = new Int32Array(data.buffer); num = data32.length; data32.set(HEAP32.subarray(src, src + num)); } ctx.putImageData(image, 0, 0); var url = hot_x === 0 && hot_y === 0 ? "url(" + canvas.toDataURL() + "), auto" : "url(" + canvas.toDataURL() + ") " + hot_x + " " + hot_y + ", auto"; var urlBuf = _malloc(url.length + 1); stringToUTF8(url, urlBuf, url.length + 1); return urlBuf; },
  437902: function ($0) { if (Module['canvas']) { Module['canvas'].style['cursor'] = UTF8ToString($0); } return 0; },
  437995: function () { if (Module['canvas']) { Module['canvas'].style['cursor'] = 'none'; } },
  438064: function () { return window.innerWidth; },
  438094: function () { return window.innerHeight; },
  438125: function ($0, $1) { alert(UTF8ToString($0) + "\n\n" + UTF8ToString($1)); }
};






function listenOnce(object, event, func) {
  object.addEventListener(event, func, { 'once': true });
}
/** @param {Object=} elements */
function autoResumeAudioContext(ctx, elements) {
  if (!elements) {
    elements = [document, document.getElementById('canvas')];
  }
  ['keydown', 'mousedown', 'touchstart'].forEach(function (event) {
    elements.forEach(function (element) {
      if (element) {
        listenOnce(element, event, function () {
          if (ctx.state === 'suspended') ctx.resume();
        });
      }
    });
  });
}

function callRuntimeCallbacks(callbacks) {
  while (callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback(Module); // Pass the module as the first argument.
      continue;
    }
    var func = callback.func;
    if (typeof func == 'number') {
      if (callback.arg === undefined) {
        (function () { dynCall_v.call(null, func); })();
      } else {
        (function (a1) { dynCall_vi.apply(null, [func, a1]); })(callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

function withStackSave(f) {
  var stack = stackSave();
  var ret = f();
  stackRestore(stack);
  return ret;
}
function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /\b_Z[\w\d_]+/g;
  return text.replace(regex,
    function (x) {
      var y = demangle(x);
      return x === y ? x : (y + ' [' + x + ']');
    });
}

function dynCallLegacy(sig, ptr, args) {
  assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
  if (args && args.length) {
    // j (64-bit integer) must be passed in as two numbers [low 32, high 32].
    assert(args.length === sig.substring(1).replace(/j/g, '--').length);
  } else {
    assert(sig.length == 1);
  }
  var f = Module["dynCall_" + sig];
  return args && args.length ? f.apply(null, [ptr].concat(args)) : f.call(null, ptr);
}

var wasmTableMirror = [];
function getWasmTableEntry(funcPtr) {
  var func = wasmTableMirror[funcPtr];
  if (!func) {
    if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
    wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
  }
  assert(wasmTable.get(funcPtr) == func, "JavaScript-side Wasm function table mirror is out of date!");
  return func;
}
/** @param {Object=} args */
function dynCall(sig, ptr, args) {
  return dynCallLegacy(sig, ptr, args);
}


function handleException(e) {
  // Certain exception types we do not treat as errors since they are used for
  // internal control flow.
  // 1. ExitStatus, which is thrown by exit()
  // 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
  //    that wish to return to JS event loop.
  if (e instanceof ExitStatus || e == 'unwind') {
    return EXITSTATUS;
  }
  quit_(1, e);
}

function jsStackTrace() {
  var error = new Error();
  if (!error.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error();
    } catch (e) {
      error = e;
    }
    if (!error.stack) {
      return '(no stack trace available)';
    }
  }
  return error.stack.toString();
}

function setWasmTableEntry(idx, func) {
  wasmTable.set(idx, func);
  wasmTableMirror[idx] = func;
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

function ___assert_fail(condition, filename, line, func) {
  abort('Assertion failed: ' + UTF8ToString(condition) + ', at: ' + [filename ? UTF8ToString(filename) : 'unknown filename', line, func ? UTF8ToString(func) : 'unknown function']);
}

var PATH = {
  splitPath: function (filename) {
    var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
    return splitPathRe.exec(filename).slice(1);
  }, normalizeArray: function (parts, allowAboveRoot) {
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === '.') {
        parts.splice(i, 1);
      } else if (last === '..') {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }
    // if the path is allowed to go above the root, restore leading ..s
    if (allowAboveRoot) {
      for (; up; up--) {
        parts.unshift('..');
      }
    }
    return parts;
  }, normalize: function (path) {
    var isAbsolute = path.charAt(0) === '/',
      trailingSlash = path.substr(-1) === '/';
    // Normalize the path
    path = PATH.normalizeArray(path.split('/').filter(function (p) {
      return !!p;
    }), !isAbsolute).join('/');
    if (!path && !isAbsolute) {
      path = '.';
    }
    if (path && trailingSlash) {
      path += '/';
    }
    return (isAbsolute ? '/' : '') + path;
  }, dirname: function (path) {
    var result = PATH.splitPath(path),
      root = result[0],
      dir = result[1];
    if (!root && !dir) {
      // No dirname whatsoever
      return '.';
    }
    if (dir) {
      // It has a dirname, strip trailing slash
      dir = dir.substr(0, dir.length - 1);
    }
    return root + dir;
  }, basename: function (path) {
    // EMSCRIPTEN return '/'' for '/', not an empty string
    if (path === '/') return '/';
    path = PATH.normalize(path);
    path = path.replace(/\/$/, "");
    var lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) return path;
    return path.substr(lastSlash + 1);
  }, extname: function (path) {
    return PATH.splitPath(path)[3];
  }, join: function () {
    var paths = Array.prototype.slice.call(arguments, 0);
    return PATH.normalize(paths.join('/'));
  }, join2: function (l, r) {
    return PATH.normalize(l + '/' + r);
  }
};

function getRandomDevice() {
  if (typeof crypto == 'object' && typeof crypto['getRandomValues'] == 'function') {
    // for modern web browsers
    var randomBuffer = new Uint8Array(1);
    return function () { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; };
  } else
    if (ENVIRONMENT_IS_NODE) {
      // for nodejs with or without crypto support included
      try {
        var crypto_module = require('crypto');
        // nodejs has crypto support
        return function () { return crypto_module['randomBytes'](1)[0]; };
      } catch (e) {
        // nodejs doesn't have crypto support
      }
    }
  // we couldn't find a proper implementation, as Math.random() is not suitable for /dev/random, see emscripten-core/emscripten/pull/7096
  return function () { abort("no cryptographic support found for randomDevice. consider polyfilling it if you want to use something insecure like Math.random(), e.g. put this in a --pre-js: var crypto = { getRandomValues: function(array) { for (var i = 0; i < array.length; i++) array[i] = (Math.random()*256)|0 } };"); };
}

var PATH_FS = {
  resolve: function () {
    var resolvedPath = '',
      resolvedAbsolute = false;
    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = (i >= 0) ? arguments[i] : FS.cwd();
      // Skip empty and invalid entries
      if (typeof path != 'string') {
        throw new TypeError('Arguments to path.resolve must be strings');
      } else if (!path) {
        return ''; // an invalid portion invalidates the whole thing
      }
      resolvedPath = path + '/' + resolvedPath;
      resolvedAbsolute = path.charAt(0) === '/';
    }
    // At this point the path should be resolved to a full absolute path, but
    // handle relative paths to be safe (might happen when process.cwd() fails)
    resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter(function (p) {
      return !!p;
    }), !resolvedAbsolute).join('/');
    return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
  }, relative: function (from, to) {
    from = PATH_FS.resolve(from).substr(1);
    to = PATH_FS.resolve(to).substr(1);
    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== '') break;
      }
      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== '') break;
      }
      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }
    var fromParts = trim(from.split('/'));
    var toParts = trim(to.split('/'));
    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }
    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push('..');
    }
    outputParts = outputParts.concat(toParts.slice(samePartsLength));
    return outputParts.join('/');
  }
};

var TTY = {
  ttys: [], init: function () {
    // https://github.com/emscripten-core/emscripten/pull/1555
    // if (ENVIRONMENT_IS_NODE) {
    //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
    //   // device, it always assumes it's a TTY device. because of this, we're forcing
    //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
    //   // with text files until FS.init can be refactored.
    //   process['stdin']['setEncoding']('utf8');
    // }
  }, shutdown: function () {
    // https://github.com/emscripten-core/emscripten/pull/1555
    // if (ENVIRONMENT_IS_NODE) {
    //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
    //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
    //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
    //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
    //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
    //   process['stdin']['pause']();
    // }
  }, register: function (dev, ops) {
    TTY.ttys[dev] = { input: [], output: [], ops: ops };
    FS.registerDevice(dev, TTY.stream_ops);
  }, stream_ops: {
    open: function (stream) {
      var tty = TTY.ttys[stream.node.rdev];
      if (!tty) {
        throw new FS.ErrnoError(43);
      }
      stream.tty = tty;
      stream.seekable = false;
    }, close: function (stream) {
      // flush any pending line data
      stream.tty.ops.flush(stream.tty);
    }, flush: function (stream) {
      stream.tty.ops.flush(stream.tty);
    }, read: function (stream, buffer, offset, length, pos /* ignored */) {
      if (!stream.tty || !stream.tty.ops.get_char) {
        throw new FS.ErrnoError(60);
      }
      var bytesRead = 0;
      for (var i = 0; i < length; i++) {
        var result;
        try {
          result = stream.tty.ops.get_char(stream.tty);
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
        if (result === undefined && bytesRead === 0) {
          throw new FS.ErrnoError(6);
        }
        if (result === null || result === undefined) break;
        bytesRead++;
        buffer[offset + i] = result;
      }
      if (bytesRead) {
        stream.node.timestamp = Date.now();
      }
      return bytesRead;
    }, write: function (stream, buffer, offset, length, pos) {
      if (!stream.tty || !stream.tty.ops.put_char) {
        throw new FS.ErrnoError(60);
      }
      try {
        for (var i = 0; i < length; i++) {
          stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
        }
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
      if (length) {
        stream.node.timestamp = Date.now();
      }
      return i;
    }
  }, default_tty_ops: {
    get_char: function (tty) {
      if (!tty.input.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          // we will read data by chunks of BUFSIZE
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;

          try {
            bytesRead = fs.readSync(process.stdin.fd, buf, 0, BUFSIZE, -1);
          } catch (e) {
            // Cross-platform differences: on Windows, reading EOF throws an exception, but on other OSes,
            // reading EOF returns 0. Uniformize behavior by treating the EOF exception to return 0.
            if (e.toString().includes('EOF')) bytesRead = 0;
            else throw e;
          }

          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString('utf-8');
          } else {
            result = null;
          }
        } else
          if (typeof window != 'undefined' &&
            typeof window.prompt == 'function') {
            // Browser.
            result = window.prompt('Input: ');  // returns null on cancel
            if (result !== null) {
              result += '\n';
            }
          } else if (typeof readline == 'function') {
            // Command line.
            result = readline();
            if (result !== null) {
              result += '\n';
            }
          }
        if (!result) {
          return null;
        }
        tty.input = intArrayFromString(result, true);
      }
      return tty.input.shift();
    }, put_char: function (tty, val) {
      if (val === null || val === 10) {
        out(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      } else {
        if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
      }
    }, flush: function (tty) {
      if (tty.output && tty.output.length > 0) {
        out(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      }
    }
  }, default_tty1_ops: {
    put_char: function (tty, val) {
      if (val === null || val === 10) {
        err(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      } else {
        if (val != 0) tty.output.push(val);
      }
    }, flush: function (tty) {
      if (tty.output && tty.output.length > 0) {
        err(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      }
    }
  }
};

function zeroMemory(address, size) {
  HEAPU8.fill(0, address, address + size);
}

function alignMemory(size, alignment) {
  assert(alignment, "alignment argument is required");
  return Math.ceil(size / alignment) * alignment;
}
function mmapAlloc(size) {
  abort('internal error: mmapAlloc called but `emscripten_builtin_memalign` native symbol not exported');
}
var MEMFS = {
  ops_table: null, mount: function (mount) {
    return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
  }, createNode: function (parent, name, mode, dev) {
    if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
      // no supported
      throw new FS.ErrnoError(63);
    }
    if (!MEMFS.ops_table) {
      MEMFS.ops_table = {
        dir: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr,
            lookup: MEMFS.node_ops.lookup,
            mknod: MEMFS.node_ops.mknod,
            rename: MEMFS.node_ops.rename,
            unlink: MEMFS.node_ops.unlink,
            rmdir: MEMFS.node_ops.rmdir,
            readdir: MEMFS.node_ops.readdir,
            symlink: MEMFS.node_ops.symlink
          },
          stream: {
            llseek: MEMFS.stream_ops.llseek
          }
        },
        file: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr
          },
          stream: {
            llseek: MEMFS.stream_ops.llseek,
            read: MEMFS.stream_ops.read,
            write: MEMFS.stream_ops.write,
            allocate: MEMFS.stream_ops.allocate,
            mmap: MEMFS.stream_ops.mmap,
            msync: MEMFS.stream_ops.msync
          }
        },
        link: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr,
            readlink: MEMFS.node_ops.readlink
          },
          stream: {}
        },
        chrdev: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr
          },
          stream: FS.chrdev_stream_ops
        }
      };
    }
    var node = FS.createNode(parent, name, mode, dev);
    if (FS.isDir(node.mode)) {
      node.node_ops = MEMFS.ops_table.dir.node;
      node.stream_ops = MEMFS.ops_table.dir.stream;
      node.contents = {};
    } else if (FS.isFile(node.mode)) {
      node.node_ops = MEMFS.ops_table.file.node;
      node.stream_ops = MEMFS.ops_table.file.stream;
      node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
      // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
      // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
      // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
      node.contents = null;
    } else if (FS.isLink(node.mode)) {
      node.node_ops = MEMFS.ops_table.link.node;
      node.stream_ops = MEMFS.ops_table.link.stream;
    } else if (FS.isChrdev(node.mode)) {
      node.node_ops = MEMFS.ops_table.chrdev.node;
      node.stream_ops = MEMFS.ops_table.chrdev.stream;
    }
    node.timestamp = Date.now();
    // add the new node to the parent
    if (parent) {
      parent.contents[name] = node;
      parent.timestamp = node.timestamp;
    }
    return node;
  }, getFileDataAsTypedArray: function (node) {
    if (!node.contents) return new Uint8Array(0);
    if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
    return new Uint8Array(node.contents);
  }, expandFileStorage: function (node, newCapacity) {
    var prevCapacity = node.contents ? node.contents.length : 0;
    if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
    // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
    // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
    // avoid overshooting the allocation cap by a very large margin.
    var CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) >>> 0);
    if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
    var oldContents = node.contents;
    node.contents = new Uint8Array(newCapacity); // Allocate new storage.
    if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
  }, resizeFileStorage: function (node, newSize) {
    if (node.usedBytes == newSize) return;
    if (newSize == 0) {
      node.contents = null; // Fully decommit when requesting a resize to zero.
      node.usedBytes = 0;
    } else {
      var oldContents = node.contents;
      node.contents = new Uint8Array(newSize); // Allocate new storage.
      if (oldContents) {
        node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
      }
      node.usedBytes = newSize;
    }
  }, node_ops: {
    getattr: function (node) {
      var attr = {};
      // device numbers reuse inode numbers.
      attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
      attr.ino = node.id;
      attr.mode = node.mode;
      attr.nlink = 1;
      attr.uid = 0;
      attr.gid = 0;
      attr.rdev = node.rdev;
      if (FS.isDir(node.mode)) {
        attr.size = 4096;
      } else if (FS.isFile(node.mode)) {
        attr.size = node.usedBytes;
      } else if (FS.isLink(node.mode)) {
        attr.size = node.link.length;
      } else {
        attr.size = 0;
      }
      attr.atime = new Date(node.timestamp);
      attr.mtime = new Date(node.timestamp);
      attr.ctime = new Date(node.timestamp);
      // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
      //       but this is not required by the standard.
      attr.blksize = 4096;
      attr.blocks = Math.ceil(attr.size / attr.blksize);
      return attr;
    }, setattr: function (node, attr) {
      if (attr.mode !== undefined) {
        node.mode = attr.mode;
      }
      if (attr.timestamp !== undefined) {
        node.timestamp = attr.timestamp;
      }
      if (attr.size !== undefined) {
        MEMFS.resizeFileStorage(node, attr.size);
      }
    }, lookup: function (parent, name) {
      throw FS.genericErrors[44];
    }, mknod: function (parent, name, mode, dev) {
      return MEMFS.createNode(parent, name, mode, dev);
    }, rename: function (old_node, new_dir, new_name) {
      // if we're overwriting a directory at new_name, make sure it's empty.
      if (FS.isDir(old_node.mode)) {
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
        }
        if (new_node) {
          for (var i in new_node.contents) {
            throw new FS.ErrnoError(55);
          }
        }
      }
      // do the internal rewiring
      delete old_node.parent.contents[old_node.name];
      old_node.parent.timestamp = Date.now()
      old_node.name = new_name;
      new_dir.contents[new_name] = old_node;
      new_dir.timestamp = old_node.parent.timestamp;
      old_node.parent = new_dir;
    }, unlink: function (parent, name) {
      delete parent.contents[name];
      parent.timestamp = Date.now();
    }, rmdir: function (parent, name) {
      var node = FS.lookupNode(parent, name);
      for (var i in node.contents) {
        throw new FS.ErrnoError(55);
      }
      delete parent.contents[name];
      parent.timestamp = Date.now();
    }, readdir: function (node) {
      var entries = ['.', '..'];
      for (var key in node.contents) {
        if (!node.contents.hasOwnProperty(key)) {
          continue;
        }
        entries.push(key);
      }
      return entries;
    }, symlink: function (parent, newname, oldpath) {
      var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
      node.link = oldpath;
      return node;
    }, readlink: function (node) {
      if (!FS.isLink(node.mode)) {
        throw new FS.ErrnoError(28);
      }
      return node.link;
    }
  }, stream_ops: {
    read: function (stream, buffer, offset, length, position) {
      var contents = stream.node.contents;
      if (position >= stream.node.usedBytes) return 0;
      var size = Math.min(stream.node.usedBytes - position, length);
      assert(size >= 0);
      if (size > 8 && contents.subarray) { // non-trivial, and typed array
        buffer.set(contents.subarray(position, position + size), offset);
      } else {
        for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
      }
      return size;
    }, write: function (stream, buffer, offset, length, position, canOwn) {
      // The data buffer should be a typed array view
      assert(!(buffer instanceof ArrayBuffer));
      // If the buffer is located in main memory (HEAP), and if
      // memory can grow, we can't hold on to references of the
      // memory buffer, as they may get invalidated. That means we
      // need to do copy its contents.
      if (buffer.buffer === HEAP8.buffer) {
        canOwn = false;
      }

      if (!length) return 0;
      var node = stream.node;
      node.timestamp = Date.now();

      if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
        if (canOwn) {
          assert(position === 0, 'canOwn must imply no weird position inside the file');
          node.contents = buffer.subarray(offset, offset + length);
          node.usedBytes = length;
          return length;
        } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
          node.contents = buffer.slice(offset, offset + length);
          node.usedBytes = length;
          return length;
        } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
          node.contents.set(buffer.subarray(offset, offset + length), position);
          return length;
        }
      }

      // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
      MEMFS.expandFileStorage(node, position + length);
      if (node.contents.subarray && buffer.subarray) {
        // Use typed array write which is available.
        node.contents.set(buffer.subarray(offset, offset + length), position);
      } else {
        for (var i = 0; i < length; i++) {
          node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
        }
      }
      node.usedBytes = Math.max(node.usedBytes, position + length);
      return length;
    }, llseek: function (stream, offset, whence) {
      var position = offset;
      if (whence === 1) {
        position += stream.position;
      } else if (whence === 2) {
        if (FS.isFile(stream.node.mode)) {
          position += stream.node.usedBytes;
        }
      }
      if (position < 0) {
        throw new FS.ErrnoError(28);
      }
      return position;
    }, allocate: function (stream, offset, length) {
      MEMFS.expandFileStorage(stream.node, offset + length);
      stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
    }, mmap: function (stream, address, length, position, prot, flags) {
      if (address !== 0) {
        // We don't currently support location hints for the address of the mapping
        throw new FS.ErrnoError(28);
      }
      if (!FS.isFile(stream.node.mode)) {
        throw new FS.ErrnoError(43);
      }
      var ptr;
      var allocated;
      var contents = stream.node.contents;
      // Only make a new copy when MAP_PRIVATE is specified.
      if (!(flags & 2) && contents.buffer === buffer) {
        // We can't emulate MAP_SHARED when the file is not backed by the buffer
        // we're mapping to (e.g. the HEAP buffer).
        allocated = false;
        ptr = contents.byteOffset;
      } else {
        // Try to avoid unnecessary slices.
        if (position > 0 || position + length < contents.length) {
          if (contents.subarray) {
            contents = contents.subarray(position, position + length);
          } else {
            contents = Array.prototype.slice.call(contents, position, position + length);
          }
        }
        allocated = true;
        ptr = mmapAlloc(length);
        if (!ptr) {
          throw new FS.ErrnoError(48);
        }
        HEAP8.set(contents, ptr);
      }
      return { ptr: ptr, allocated: allocated };
    }, msync: function (stream, buffer, offset, length, mmapFlags) {
      if (!FS.isFile(stream.node.mode)) {
        throw new FS.ErrnoError(43);
      }
      if (mmapFlags & 2) {
        // MAP_PRIVATE calls need not to be synced back to underlying fs
        return 0;
      }

      var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
      // should we check if bytesWritten and length are the same?
      return 0;
    }
  }
};

/** @param {boolean=} noRunDep */
function asyncLoad(url, onload, onerror, noRunDep) {
  var dep = !noRunDep ? getUniqueRunDependency('al ' + url) : '';
  readAsync(url, function (arrayBuffer) {
    assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
    onload(new Uint8Array(arrayBuffer));
    if (dep) removeRunDependency(dep);
  }, function (event) {
    if (onerror) {
      onerror();
    } else {
      throw 'Loading data file "' + url + '" failed.';
    }
  });
  if (dep) addRunDependency(dep);
}

var ERRNO_MESSAGES = { 0: "Success", 1: "Arg list too long", 2: "Permission denied", 3: "Address already in use", 4: "Address not available", 5: "Address family not supported by protocol family", 6: "No more processes", 7: "Socket already connected", 8: "Bad file number", 9: "Trying to read unreadable message", 10: "Mount device busy", 11: "Operation canceled", 12: "No children", 13: "Connection aborted", 14: "Connection refused", 15: "Connection reset by peer", 16: "File locking deadlock error", 17: "Destination address required", 18: "Math arg out of domain of func", 19: "Quota exceeded", 20: "File exists", 21: "Bad address", 22: "File too large", 23: "Host is unreachable", 24: "Identifier removed", 25: "Illegal byte sequence", 26: "Connection already in progress", 27: "Interrupted system call", 28: "Invalid argument", 29: "I/O error", 30: "Socket is already connected", 31: "Is a directory", 32: "Too many symbolic links", 33: "Too many open files", 34: "Too many links", 35: "Message too long", 36: "Multihop attempted", 37: "File or path name too long", 38: "Network interface is not configured", 39: "Connection reset by network", 40: "Network is unreachable", 41: "Too many open files in system", 42: "No buffer space available", 43: "No such device", 44: "No such file or directory", 45: "Exec format error", 46: "No record locks available", 47: "The link has been severed", 48: "Not enough core", 49: "No message of desired type", 50: "Protocol not available", 51: "No space left on device", 52: "Function not implemented", 53: "Socket is not connected", 54: "Not a directory", 55: "Directory not empty", 56: "State not recoverable", 57: "Socket operation on non-socket", 59: "Not a typewriter", 60: "No such device or address", 61: "Value too large for defined data type", 62: "Previous owner died", 63: "Not super-user", 64: "Broken pipe", 65: "Protocol error", 66: "Unknown protocol", 67: "Protocol wrong type for socket", 68: "Math result not representable", 69: "Read only file system", 70: "Illegal seek", 71: "No such process", 72: "Stale file handle", 73: "Connection timed out", 74: "Text file busy", 75: "Cross-device link", 100: "Device not a stream", 101: "Bad font file fmt", 102: "Invalid slot", 103: "Invalid request code", 104: "No anode", 105: "Block device required", 106: "Channel number out of range", 107: "Level 3 halted", 108: "Level 3 reset", 109: "Link number out of range", 110: "Protocol driver not attached", 111: "No CSI structure available", 112: "Level 2 halted", 113: "Invalid exchange", 114: "Invalid request descriptor", 115: "Exchange full", 116: "No data (for no delay io)", 117: "Timer expired", 118: "Out of streams resources", 119: "Machine is not on the network", 120: "Package not installed", 121: "The object is remote", 122: "Advertise error", 123: "Srmount error", 124: "Communication error on send", 125: "Cross mount point (not really error)", 126: "Given log. name not unique", 127: "f.d. invalid for this operation", 128: "Remote address changed", 129: "Can   access a needed shared lib", 130: "Accessing a corrupted shared lib", 131: ".lib section in a.out corrupted", 132: "Attempting to link in too many libs", 133: "Attempting to exec a shared library", 135: "Streams pipe error", 136: "Too many users", 137: "Socket type not supported", 138: "Not supported", 139: "Protocol family not supported", 140: "Can't send after socket shutdown", 141: "Too many references", 142: "Host is down", 148: "No medium (in tape drive)", 156: "Level 2 not synchronized" };

var ERRNO_CODES = {};
var FS = {
  root: null, mounts: [], devices: {}, streams: [], nextInode: 1, nameTable: null, currentPath: "/", initialized: false, ignorePermissions: true, ErrnoError: null, genericErrors: {}, filesystems: null, syncFSRequests: 0, lookupPath: (path, opts = {}) => {
    path = PATH_FS.resolve(FS.cwd(), path);

    if (!path) return { path: '', node: null };

    var defaults = {
      follow_mount: true,
      recurse_count: 0
    };
    for (var key in defaults) {
      if (opts[key] === undefined) {
        opts[key] = defaults[key];
      }
    }

    if (opts.recurse_count > 8) {  // max recursive lookup of 8
      throw new FS.ErrnoError(32);
    }

    // split the path
    var parts = PATH.normalizeArray(path.split('/').filter((p) => !!p), false);

    // start at the root
    var current = FS.root;
    var current_path = '/';

    for (var i = 0; i < parts.length; i++) {
      var islast = (i === parts.length - 1);
      if (islast && opts.parent) {
        // stop resolving
        break;
      }

      current = FS.lookupNode(current, parts[i]);
      current_path = PATH.join2(current_path, parts[i]);

      // jump to the mount's root node if this is a mountpoint
      if (FS.isMountpoint(current)) {
        if (!islast || (islast && opts.follow_mount)) {
          current = current.mounted.root;
        }
      }

      // by default, lookupPath will not follow a symlink if it is the final path component.
      // setting opts.follow = true will override this behavior.
      if (!islast || opts.follow) {
        var count = 0;
        while (FS.isLink(current.mode)) {
          var link = FS.readlink(current_path);
          current_path = PATH_FS.resolve(PATH.dirname(current_path), link);

          var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
          current = lookup.node;

          if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
            throw new FS.ErrnoError(32);
          }
        }
      }
    }

    return { path: current_path, node: current };
  }, getPath: (node) => {
    var path;
    while (true) {
      if (FS.isRoot(node)) {
        var mount = node.mount.mountpoint;
        if (!path) return mount;
        return mount[mount.length - 1] !== '/' ? mount + '/' + path : mount + path;
      }
      path = path ? node.name + '/' + path : node.name;
      node = node.parent;
    }
  }, hashName: (parentid, name) => {
    var hash = 0;

    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return ((parentid + hash) >>> 0) % FS.nameTable.length;
  }, hashAddNode: (node) => {
    var hash = FS.hashName(node.parent.id, node.name);
    node.name_next = FS.nameTable[hash];
    FS.nameTable[hash] = node;
  }, hashRemoveNode: (node) => {
    var hash = FS.hashName(node.parent.id, node.name);
    if (FS.nameTable[hash] === node) {
      FS.nameTable[hash] = node.name_next;
    } else {
      var current = FS.nameTable[hash];
      while (current) {
        if (current.name_next === node) {
          current.name_next = node.name_next;
          break;
        }
        current = current.name_next;
      }
    }
  }, lookupNode: (parent, name) => {
    var errCode = FS.mayLookup(parent);
    if (errCode) {
      throw new FS.ErrnoError(errCode, parent);
    }
    var hash = FS.hashName(parent.id, name);
    for (var node = FS.nameTable[hash]; node; node = node.name_next) {
      var nodeName = node.name;
      if (node.parent.id === parent.id && nodeName === name) {
        return node;
      }
    }
    // if we failed to find it in the cache, call into the VFS
    return FS.lookup(parent, name);
  }, createNode: (parent, name, mode, rdev) => {
    assert(typeof parent == 'object')
    var node = new FS.FSNode(parent, name, mode, rdev);

    FS.hashAddNode(node);

    return node;
  }, destroyNode: (node) => {
    FS.hashRemoveNode(node);
  }, isRoot: (node) => {
    return node === node.parent;
  }, isMountpoint: (node) => {
    return !!node.mounted;
  }, isFile: (mode) => {
    return (mode & 61440) === 32768;
  }, isDir: (mode) => {
    return (mode & 61440) === 16384;
  }, isLink: (mode) => {
    return (mode & 61440) === 40960;
  }, isChrdev: (mode) => {
    return (mode & 61440) === 8192;
  }, isBlkdev: (mode) => {
    return (mode & 61440) === 24576;
  }, isFIFO: (mode) => {
    return (mode & 61440) === 4096;
  }, isSocket: (mode) => {
    return (mode & 49152) === 49152;
  }, flagModes: { "r": 0, "r+": 2, "w": 577, "w+": 578, "a": 1089, "a+": 1090 }, modeStringToFlags: (str) => {
    var flags = FS.flagModes[str];
    if (typeof flags == 'undefined') {
      throw new Error('Unknown file open mode: ' + str);
    }
    return flags;
  }, flagsToPermissionString: (flag) => {
    var perms = ['r', 'w', 'rw'][flag & 3];
    if ((flag & 512)) {
      perms += 'w';
    }
    return perms;
  }, nodePermissions: (node, perms) => {
    if (FS.ignorePermissions) {
      return 0;
    }
    // return 0 if any user, group or owner bits are set.
    if (perms.includes('r') && !(node.mode & 292)) {
      return 2;
    } else if (perms.includes('w') && !(node.mode & 146)) {
      return 2;
    } else if (perms.includes('x') && !(node.mode & 73)) {
      return 2;
    }
    return 0;
  }, mayLookup: (dir) => {
    var errCode = FS.nodePermissions(dir, 'x');
    if (errCode) return errCode;
    if (!dir.node_ops.lookup) return 2;
    return 0;
  }, mayCreate: (dir, name) => {
    try {
      var node = FS.lookupNode(dir, name);
      return 20;
    } catch (e) {
    }
    return FS.nodePermissions(dir, 'wx');
  }, mayDelete: (dir, name, isdir) => {
    var node;
    try {
      node = FS.lookupNode(dir, name);
    } catch (e) {
      return e.errno;
    }
    var errCode = FS.nodePermissions(dir, 'wx');
    if (errCode) {
      return errCode;
    }
    if (isdir) {
      if (!FS.isDir(node.mode)) {
        return 54;
      }
      if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
        return 10;
      }
    } else {
      if (FS.isDir(node.mode)) {
        return 31;
      }
    }
    return 0;
  }, mayOpen: (node, flags) => {
    if (!node) {
      return 44;
    }
    if (FS.isLink(node.mode)) {
      return 32;
    } else if (FS.isDir(node.mode)) {
      if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
        (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
        return 31;
      }
    }
    return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
  }, MAX_OPEN_FDS: 4096, nextfd: (fd_start = 0, fd_end = FS.MAX_OPEN_FDS) => {
    for (var fd = fd_start; fd <= fd_end; fd++) {
      if (!FS.streams[fd]) {
        return fd;
      }
    }
    throw new FS.ErrnoError(33);
  }, getStream: (fd) => FS.streams[fd], createStream: (stream, fd_start, fd_end) => {
    if (!FS.FSStream) {
      FS.FSStream = /** @constructor */ function () { };
      FS.FSStream.prototype = {
        object: {
          get: function () { return this.node; },
          set: function (val) { this.node = val; }
        },
        isRead: {
          get: function () { return (this.flags & 2097155) !== 1; }
        },
        isWrite: {
          get: function () { return (this.flags & 2097155) !== 0; }
        },
        isAppend: {
          get: function () { return (this.flags & 1024); }
        }
      };
    }
    // clone it, so we can return an instance of FSStream
    stream = Object.assign(new FS.FSStream(), stream);
    var fd = FS.nextfd(fd_start, fd_end);
    stream.fd = fd;
    FS.streams[fd] = stream;
    return stream;
  }, closeStream: (fd) => {
    FS.streams[fd] = null;
  }, chrdev_stream_ops: {
    open: (stream) => {
      var device = FS.getDevice(stream.node.rdev);
      // override node's stream ops with the device's
      stream.stream_ops = device.stream_ops;
      // forward the open call
      if (stream.stream_ops.open) {
        stream.stream_ops.open(stream);
      }
    }, llseek: () => {
      throw new FS.ErrnoError(70);
    }
  }, major: (dev) => ((dev) >> 8), minor: (dev) => ((dev) & 0xff), makedev: (ma, mi) => ((ma) << 8 | (mi)), registerDevice: (dev, ops) => {
    FS.devices[dev] = { stream_ops: ops };
  }, getDevice: (dev) => FS.devices[dev], getMounts: (mount) => {
    var mounts = [];
    var check = [mount];

    while (check.length) {
      var m = check.pop();

      mounts.push(m);

      check.push.apply(check, m.mounts);
    }

    return mounts;
  }, syncfs: (populate, callback) => {
    if (typeof populate == 'function') {
      callback = populate;
      populate = false;
    }

    FS.syncFSRequests++;

    if (FS.syncFSRequests > 1) {
      err('warning: ' + FS.syncFSRequests + ' FS.syncfs operations in flight at once, probably just doing extra work');
    }

    var mounts = FS.getMounts(FS.root.mount);
    var completed = 0;

    function doCallback(errCode) {
      assert(FS.syncFSRequests > 0);
      FS.syncFSRequests--;
      return callback(errCode);
    }

    function done(errCode) {
      if (errCode) {
        if (!done.errored) {
          done.errored = true;
          return doCallback(errCode);
        }
        return;
      }
      if (++completed >= mounts.length) {
        doCallback(null);
      }
    };

    // sync all mounts
    mounts.forEach((mount) => {
      if (!mount.type.syncfs) {
        return done(null);
      }
      mount.type.syncfs(mount, populate, done);
    });
  }, mount: (type, opts, mountpoint) => {
    if (typeof type == 'string') {
      // The filesystem was not included, and instead we have an error
      // message stored in the variable.
      throw type;
    }
    var root = mountpoint === '/';
    var pseudo = !mountpoint;
    var node;

    if (root && FS.root) {
      throw new FS.ErrnoError(10);
    } else if (!root && !pseudo) {
      var lookup = FS.lookupPath(mountpoint, { follow_mount: false });

      mountpoint = lookup.path;  // use the absolute path
      node = lookup.node;

      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(10);
      }

      if (!FS.isDir(node.mode)) {
        throw new FS.ErrnoError(54);
      }
    }

    var mount = {
      type: type,
      opts: opts,
      mountpoint: mountpoint,
      mounts: []
    };

    // create a root node for the fs
    var mountRoot = type.mount(mount);
    mountRoot.mount = mount;
    mount.root = mountRoot;

    if (root) {
      FS.root = mountRoot;
    } else if (node) {
      // set as a mountpoint
      node.mounted = mount;

      // add the new mount to the current mount's children
      if (node.mount) {
        node.mount.mounts.push(mount);
      }
    }

    return mountRoot;
  }, unmount: (mountpoint) => {
    var lookup = FS.lookupPath(mountpoint, { follow_mount: false });

    if (!FS.isMountpoint(lookup.node)) {
      throw new FS.ErrnoError(28);
    }

    // destroy the nodes for this mount, and all its child mounts
    var node = lookup.node;
    var mount = node.mounted;
    var mounts = FS.getMounts(mount);

    Object.keys(FS.nameTable).forEach((hash) => {
      var current = FS.nameTable[hash];

      while (current) {
        var next = current.name_next;

        if (mounts.includes(current.mount)) {
          FS.destroyNode(current);
        }

        current = next;
      }
    });

    // no longer a mountpoint
    node.mounted = null;

    // remove this mount from the child mounts
    var idx = node.mount.mounts.indexOf(mount);
    assert(idx !== -1);
    node.mount.mounts.splice(idx, 1);
  }, lookup: (parent, name) => {
    return parent.node_ops.lookup(parent, name);
  }, mknod: (path, mode, dev) => {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    if (!name || name === '.' || name === '..') {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.mayCreate(parent, name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.mknod) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.mknod(parent, name, mode, dev);
  }, create: (path, mode) => {
    mode = mode !== undefined ? mode : 438 /* 0666 */;
    mode &= 4095;
    mode |= 32768;
    return FS.mknod(path, mode, 0);
  }, mkdir: (path, mode) => {
    mode = mode !== undefined ? mode : 511 /* 0777 */;
    mode &= 511 | 512;
    mode |= 16384;
    return FS.mknod(path, mode, 0);
  }, mkdirTree: (path, mode) => {
    var dirs = path.split('/');
    var d = '';
    for (var i = 0; i < dirs.length; ++i) {
      if (!dirs[i]) continue;
      d += '/' + dirs[i];
      try {
        FS.mkdir(d, mode);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
    }
  }, mkdev: (path, mode, dev) => {
    if (typeof dev == 'undefined') {
      dev = mode;
      mode = 438 /* 0666 */;
    }
    mode |= 8192;
    return FS.mknod(path, mode, dev);
  }, symlink: (oldpath, newpath) => {
    if (!PATH_FS.resolve(oldpath)) {
      throw new FS.ErrnoError(44);
    }
    var lookup = FS.lookupPath(newpath, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var newname = PATH.basename(newpath);
    var errCode = FS.mayCreate(parent, newname);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.symlink) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.symlink(parent, newname, oldpath);
  }, rename: (old_path, new_path) => {
    var old_dirname = PATH.dirname(old_path);
    var new_dirname = PATH.dirname(new_path);
    var old_name = PATH.basename(old_path);
    var new_name = PATH.basename(new_path);
    // parents must exist
    var lookup, old_dir, new_dir;

    // let the errors from non existant directories percolate up
    lookup = FS.lookupPath(old_path, { parent: true });
    old_dir = lookup.node;
    lookup = FS.lookupPath(new_path, { parent: true });
    new_dir = lookup.node;

    if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
    // need to be part of the same mount
    if (old_dir.mount !== new_dir.mount) {
      throw new FS.ErrnoError(75);
    }
    // source must exist
    var old_node = FS.lookupNode(old_dir, old_name);
    // old path should not be an ancestor of the new path
    var relative = PATH_FS.relative(old_path, new_dirname);
    if (relative.charAt(0) !== '.') {
      throw new FS.ErrnoError(28);
    }
    // new path should not be an ancestor of the old path
    relative = PATH_FS.relative(new_path, old_dirname);
    if (relative.charAt(0) !== '.') {
      throw new FS.ErrnoError(55);
    }
    // see if the new path already exists
    var new_node;
    try {
      new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {
      // not fatal
    }
    // early out if nothing needs to change
    if (old_node === new_node) {
      return;
    }
    // we'll need to delete the old entry
    var isdir = FS.isDir(old_node.mode);
    var errCode = FS.mayDelete(old_dir, old_name, isdir);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    // need delete permissions if we'll be overwriting.
    // need create permissions if new doesn't already exist.
    errCode = new_node ?
      FS.mayDelete(new_dir, new_name, isdir) :
      FS.mayCreate(new_dir, new_name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!old_dir.node_ops.rename) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
      throw new FS.ErrnoError(10);
    }
    // if we are going to change the parent, check write permissions
    if (new_dir !== old_dir) {
      errCode = FS.nodePermissions(old_dir, 'w');
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    // remove the node from the lookup hash
    FS.hashRemoveNode(old_node);
    // do the underlying fs rename
    try {
      old_dir.node_ops.rename(old_node, new_dir, new_name);
    } catch (e) {
      throw e;
    } finally {
      // add the node back to the hash (in case node_ops.rename
      // changed its name)
      FS.hashAddNode(old_node);
    }
  }, rmdir: (path) => {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, true);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.rmdir) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.rmdir(parent, name);
    FS.destroyNode(node);
  }, readdir: (path) => {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    if (!node.node_ops.readdir) {
      throw new FS.ErrnoError(54);
    }
    return node.node_ops.readdir(node);
  }, unlink: (path) => {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, false);
    if (errCode) {
      // According to POSIX, we should map EISDIR to EPERM, but
      // we instead do what Linux does (and we must, as we use
      // the musl linux libc).
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.unlink) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.unlink(parent, name);
    FS.destroyNode(node);
  }, readlink: (path) => {
    var lookup = FS.lookupPath(path);
    var link = lookup.node;
    if (!link) {
      throw new FS.ErrnoError(44);
    }
    if (!link.node_ops.readlink) {
      throw new FS.ErrnoError(28);
    }
    return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
  }, stat: (path, dontFollow) => {
    var lookup = FS.lookupPath(path, { follow: !dontFollow });
    var node = lookup.node;
    if (!node) {
      throw new FS.ErrnoError(44);
    }
    if (!node.node_ops.getattr) {
      throw new FS.ErrnoError(63);
    }
    return node.node_ops.getattr(node);
  }, lstat: (path) => {
    return FS.stat(path, true);
  }, chmod: (path, mode, dontFollow) => {
    var node;
    if (typeof path == 'string') {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(63);
    }
    node.node_ops.setattr(node, {
      mode: (mode & 4095) | (node.mode & ~4095),
      timestamp: Date.now()
    });
  }, lchmod: (path, mode) => {
    FS.chmod(path, mode, true);
  }, fchmod: (fd, mode) => {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    FS.chmod(stream.node, mode);
  }, chown: (path, uid, gid, dontFollow) => {
    var node;
    if (typeof path == 'string') {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(63);
    }
    node.node_ops.setattr(node, {
      timestamp: Date.now()
      // we ignore the uid / gid for now
    });
  }, lchown: (path, uid, gid) => {
    FS.chown(path, uid, gid, true);
  }, fchown: (fd, uid, gid) => {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    FS.chown(stream.node, uid, gid);
  }, truncate: (path, len) => {
    if (len < 0) {
      throw new FS.ErrnoError(28);
    }
    var node;
    if (typeof path == 'string') {
      var lookup = FS.lookupPath(path, { follow: true });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isDir(node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!FS.isFile(node.mode)) {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.nodePermissions(node, 'w');
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    node.node_ops.setattr(node, {
      size: len,
      timestamp: Date.now()
    });
  }, ftruncate: (fd, len) => {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(28);
    }
    FS.truncate(stream.node, len);
  }, utime: (path, atime, mtime) => {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    node.node_ops.setattr(node, {
      timestamp: Math.max(atime, mtime)
    });
  }, open: (path, flags, mode, fd_start, fd_end) => {
    if (path === "") {
      throw new FS.ErrnoError(44);
    }
    flags = typeof flags == 'string' ? FS.modeStringToFlags(flags) : flags;
    mode = typeof mode == 'undefined' ? 438 /* 0666 */ : mode;
    if ((flags & 64)) {
      mode = (mode & 4095) | 32768;
    } else {
      mode = 0;
    }
    var node;
    if (typeof path == 'object') {
      node = path;
    } else {
      path = PATH.normalize(path);
      try {
        var lookup = FS.lookupPath(path, {
          follow: !(flags & 131072)
        });
        node = lookup.node;
      } catch (e) {
        // ignore
      }
    }
    // perhaps we need to create the node
    var created = false;
    if ((flags & 64)) {
      if (node) {
        // if O_CREAT and O_EXCL are set, error out if the node already exists
        if ((flags & 128)) {
          throw new FS.ErrnoError(20);
        }
      } else {
        // node doesn't exist, try to create it
        node = FS.mknod(path, mode, 0);
        created = true;
      }
    }
    if (!node) {
      throw new FS.ErrnoError(44);
    }
    // can't truncate a device
    if (FS.isChrdev(node.mode)) {
      flags &= ~512;
    }
    // if asked only for a directory, then this must be one
    if ((flags & 65536) && !FS.isDir(node.mode)) {
      throw new FS.ErrnoError(54);
    }
    // check permissions, if this is not a file we just created now (it is ok to
    // create and write to a file with read-only permissions; it is read-only
    // for later use)
    if (!created) {
      var errCode = FS.mayOpen(node, flags);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    // do truncation if necessary
    if ((flags & 512)) {
      FS.truncate(node, 0);
    }
    // we've already handled these, don't pass down to the underlying vfs
    flags &= ~(128 | 512 | 131072);

    // register the stream with the filesystem
    var stream = FS.createStream({
      node: node,
      path: FS.getPath(node),  // we want the absolute path to the node
      flags: flags,
      seekable: true,
      position: 0,
      stream_ops: node.stream_ops,
      // used by the file family libc calls (fopen, fwrite, ferror, etc.)
      ungotten: [],
      error: false
    }, fd_start, fd_end);
    // call the new stream's open function
    if (stream.stream_ops.open) {
      stream.stream_ops.open(stream);
    }
    if (Module['logReadFiles'] && !(flags & 1)) {
      if (!FS.readFiles) FS.readFiles = {};
      if (!(path in FS.readFiles)) {
        FS.readFiles[path] = 1;
      }
    }
    return stream;
  }, close: (stream) => {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (stream.getdents) stream.getdents = null; // free readdir state
    try {
      if (stream.stream_ops.close) {
        stream.stream_ops.close(stream);
      }
    } catch (e) {
      throw e;
    } finally {
      FS.closeStream(stream.fd);
    }
    stream.fd = null;
  }, isClosed: (stream) => {
    return stream.fd === null;
  }, llseek: (stream, offset, whence) => {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (!stream.seekable || !stream.stream_ops.llseek) {
      throw new FS.ErrnoError(70);
    }
    if (whence != 0 && whence != 1 && whence != 2) {
      throw new FS.ErrnoError(28);
    }
    stream.position = stream.stream_ops.llseek(stream, offset, whence);
    stream.ungotten = [];
    return stream.position;
  }, read: (stream, buffer, offset, length, position) => {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.read) {
      throw new FS.ErrnoError(28);
    }
    var seeking = typeof position != 'undefined';
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
    if (!seeking) stream.position += bytesRead;
    return bytesRead;
  }, write: (stream, buffer, offset, length, position, canOwn) => {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.write) {
      throw new FS.ErrnoError(28);
    }
    if (stream.seekable && stream.flags & 1024) {
      // seek to the end before writing in append mode
      FS.llseek(stream, 0, 2);
    }
    var seeking = typeof position != 'undefined';
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
    if (!seeking) stream.position += bytesWritten;
    return bytesWritten;
  }, allocate: (stream, offset, length) => {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (offset < 0 || length <= 0) {
      throw new FS.ErrnoError(28);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(8);
    }
    if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(43);
    }
    if (!stream.stream_ops.allocate) {
      throw new FS.ErrnoError(138);
    }
    stream.stream_ops.allocate(stream, offset, length);
  }, mmap: (stream, address, length, position, prot, flags) => {
    // User requests writing to file (prot & PROT_WRITE != 0).
    // Checking if we have permissions to write to the file unless
    // MAP_PRIVATE flag is set. According to POSIX spec it is possible
    // to write to file opened in read-only mode with MAP_PRIVATE flag,
    // as all modifications will be visible only in the memory of
    // the current process.
    if ((prot & 2) !== 0
      && (flags & 2) === 0
      && (stream.flags & 2097155) !== 2) {
      throw new FS.ErrnoError(2);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(2);
    }
    if (!stream.stream_ops.mmap) {
      throw new FS.ErrnoError(43);
    }
    return stream.stream_ops.mmap(stream, address, length, position, prot, flags);
  }, msync: (stream, buffer, offset, length, mmapFlags) => {
    if (!stream || !stream.stream_ops.msync) {
      return 0;
    }
    return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
  }, munmap: (stream) => 0, ioctl: (stream, cmd, arg) => {
    if (!stream.stream_ops.ioctl) {
      throw new FS.ErrnoError(59);
    }
    return stream.stream_ops.ioctl(stream, cmd, arg);
  }, readFile: (path, opts = {}) => {
    opts.flags = opts.flags || 0;
    opts.encoding = opts.encoding || 'binary';
    if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
      throw new Error('Invalid encoding type "' + opts.encoding + '"');
    }
    var ret;
    var stream = FS.open(path, opts.flags);
    var stat = FS.stat(path);
    var length = stat.size;
    var buf = new Uint8Array(length);
    FS.read(stream, buf, 0, length, 0);
    if (opts.encoding === 'utf8') {
      ret = UTF8ArrayToString(buf, 0);
    } else if (opts.encoding === 'binary') {
      ret = buf;
    }
    FS.close(stream);
    return ret;
  }, writeFile: (path, data, opts = {}) => {
    opts.flags = opts.flags || 577;
    var stream = FS.open(path, opts.flags, opts.mode);
    if (typeof data == 'string') {
      var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
      var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
      FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
    } else if (ArrayBuffer.isView(data)) {
      FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
    } else {
      throw new Error('Unsupported data type');
    }
    FS.close(stream);
  }, cwd: () => FS.currentPath, chdir: (path) => {
    var lookup = FS.lookupPath(path, { follow: true });
    if (lookup.node === null) {
      throw new FS.ErrnoError(44);
    }
    if (!FS.isDir(lookup.node.mode)) {
      throw new FS.ErrnoError(54);
    }
    var errCode = FS.nodePermissions(lookup.node, 'x');
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    FS.currentPath = lookup.path;
  }, createDefaultDirectories: () => {
    FS.mkdir('/tmp');
    FS.mkdir('/home');
    FS.mkdir('/home/web_user');
  }, createDefaultDevices: () => {
    // create /dev
    FS.mkdir('/dev');
    // setup /dev/null
    FS.registerDevice(FS.makedev(1, 3), {
      read: () => 0,
      write: (stream, buffer, offset, length, pos) => length,
    });
    FS.mkdev('/dev/null', FS.makedev(1, 3));
    // setup /dev/tty and /dev/tty1
    // stderr needs to print output using err() rather than out()
    // so we register a second tty just for it.
    TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
    TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
    FS.mkdev('/dev/tty', FS.makedev(5, 0));
    FS.mkdev('/dev/tty1', FS.makedev(6, 0));
    // setup /dev/[u]random
    var random_device = getRandomDevice();
    FS.createDevice('/dev', 'random', random_device);
    FS.createDevice('/dev', 'urandom', random_device);
    // we're not going to emulate the actual shm device,
    // just create the tmp dirs that reside in it commonly
    FS.mkdir('/dev/shm');
    FS.mkdir('/dev/shm/tmp');
  }, createSpecialDirectories: () => {
    // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the
    // name of the stream for fd 6 (see test_unistd_ttyname)
    FS.mkdir('/proc');
    var proc_self = FS.mkdir('/proc/self');
    FS.mkdir('/proc/self/fd');
    FS.mount({
      mount: () => {
        var node = FS.createNode(proc_self, 'fd', 16384 | 511 /* 0777 */, 73);
        node.node_ops = {
          lookup: (parent, name) => {
            var fd = +name;
            var stream = FS.getStream(fd);
            if (!stream) throw new FS.ErrnoError(8);
            var ret = {
              parent: null,
              mount: { mountpoint: 'fake' },
              node_ops: { readlink: () => stream.path },
            };
            ret.parent = ret; // make it look like a simple root node
            return ret;
          }
        };
        return node;
      }
    }, {}, '/proc/self/fd');
  }, createStandardStreams: () => {
    // TODO deprecate the old functionality of a single
    // input / output callback and that utilizes FS.createDevice
    // and instead require a unique set of stream ops

    // by default, we symlink the standard streams to the
    // default tty devices. however, if the standard streams
    // have been overwritten we create a unique device for
    // them instead.
    if (Module['stdin']) {
      FS.createDevice('/dev', 'stdin', Module['stdin']);
    } else {
      FS.symlink('/dev/tty', '/dev/stdin');
    }
    if (Module['stdout']) {
      FS.createDevice('/dev', 'stdout', null, Module['stdout']);
    } else {
      FS.symlink('/dev/tty', '/dev/stdout');
    }
    if (Module['stderr']) {
      FS.createDevice('/dev', 'stderr', null, Module['stderr']);
    } else {
      FS.symlink('/dev/tty1', '/dev/stderr');
    }

    // open default streams for the stdin, stdout and stderr devices
    var stdin = FS.open('/dev/stdin', 0);
    var stdout = FS.open('/dev/stdout', 1);
    var stderr = FS.open('/dev/stderr', 1);
    assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
    assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
    assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
  }, ensureErrnoError: () => {
    if (FS.ErrnoError) return;
    FS.ErrnoError = /** @this{Object} */ function ErrnoError(errno, node) {
      this.node = node;
      this.setErrno = /** @this{Object} */ function (errno) {
        this.errno = errno;
        for (var key in ERRNO_CODES) {
          if (ERRNO_CODES[key] === errno) {
            this.code = key;
            break;
          }
        }
      };
      this.setErrno(errno);
      this.message = ERRNO_MESSAGES[errno];

      // Try to get a maximally helpful stack trace. On Node.js, getting Error.stack
      // now ensures it shows what we want.
      if (this.stack) {
        // Define the stack property for Node.js 4, which otherwise errors on the next line.
        Object.defineProperty(this, "stack", { value: (new Error).stack, writable: true });
        this.stack = demangleAll(this.stack);
      }
    };
    FS.ErrnoError.prototype = new Error();
    FS.ErrnoError.prototype.constructor = FS.ErrnoError;
    // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
    [44].forEach((code) => {
      FS.genericErrors[code] = new FS.ErrnoError(code);
      FS.genericErrors[code].stack = '<generic error, no stack>';
    });
  }, staticInit: () => {
    FS.ensureErrnoError();

    FS.nameTable = new Array(4096);

    FS.mount(MEMFS, {}, '/');

    FS.createDefaultDirectories();
    FS.createDefaultDevices();
    FS.createSpecialDirectories();

    FS.filesystems = {
      'MEMFS': MEMFS,
    };
  }, init: (input, output, error) => {
    assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
    FS.init.initialized = true;

    FS.ensureErrnoError();

    // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
    Module['stdin'] = input || Module['stdin'];
    Module['stdout'] = output || Module['stdout'];
    Module['stderr'] = error || Module['stderr'];

    FS.createStandardStreams();
  }, quit: () => {
    FS.init.initialized = false;
    // Call musl-internal function to close all stdio streams, so nothing is
    // left in internal buffers.
    ___stdio_exit();
    // close all of our streams
    for (var i = 0; i < FS.streams.length; i++) {
      var stream = FS.streams[i];
      if (!stream) {
        continue;
      }
      FS.close(stream);
    }
  }, getMode: (canRead, canWrite) => {
    var mode = 0;
    if (canRead) mode |= 292 | 73;
    if (canWrite) mode |= 146;
    return mode;
  }, findObject: (path, dontResolveLastLink) => {
    var ret = FS.analyzePath(path, dontResolveLastLink);
    if (ret.exists) {
      return ret.object;
    } else {
      return null;
    }
  }, analyzePath: (path, dontResolveLastLink) => {
    // operate from within the context of the symlink's target
    try {
      var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      path = lookup.path;
    } catch (e) {
    }
    var ret = {
      isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
      parentExists: false, parentPath: null, parentObject: null
    };
    try {
      var lookup = FS.lookupPath(path, { parent: true });
      ret.parentExists = true;
      ret.parentPath = lookup.path;
      ret.parentObject = lookup.node;
      ret.name = PATH.basename(path);
      lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      ret.exists = true;
      ret.path = lookup.path;
      ret.object = lookup.node;
      ret.name = lookup.node.name;
      ret.isRoot = lookup.path === '/';
    } catch (e) {
      ret.error = e.errno;
    };
    return ret;
  }, createPath: (parent, path, canRead, canWrite) => {
    parent = typeof parent == 'string' ? parent : FS.getPath(parent);
    var parts = path.split('/').reverse();
    while (parts.length) {
      var part = parts.pop();
      if (!part) continue;
      var current = PATH.join2(parent, part);
      try {
        FS.mkdir(current);
      } catch (e) {
        // ignore EEXIST
      }
      parent = current;
    }
    return current;
  }, createFile: (parent, name, properties, canRead, canWrite) => {
    var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
    var mode = FS.getMode(canRead, canWrite);
    return FS.create(path, mode);
  }, createDataFile: (parent, name, data, canRead, canWrite, canOwn) => {
    var path = name;
    if (parent) {
      parent = typeof parent == 'string' ? parent : FS.getPath(parent);
      path = name ? PATH.join2(parent, name) : parent;
    }
    var mode = FS.getMode(canRead, canWrite);
    var node = FS.create(path, mode);
    if (data) {
      if (typeof data == 'string') {
        var arr = new Array(data.length);
        for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
        data = arr;
      }
      // make sure we can write to the file
      FS.chmod(node, mode | 146);
      var stream = FS.open(node, 577);
      FS.write(stream, data, 0, data.length, 0, canOwn);
      FS.close(stream);
      FS.chmod(node, mode);
    }
    return node;
  }, createDevice: (parent, name, input, output) => {
    var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
    var mode = FS.getMode(!!input, !!output);
    if (!FS.createDevice.major) FS.createDevice.major = 64;
    var dev = FS.makedev(FS.createDevice.major++, 0);
    // Create a fake device that a set of stream ops to emulate
    // the old behavior.
    FS.registerDevice(dev, {
      open: (stream) => {
        stream.seekable = false;
      },
      close: (stream) => {
        // flush any pending line data
        if (output && output.buffer && output.buffer.length) {
          output(10);
        }
      },
      read: (stream, buffer, offset, length, pos /* ignored */) => {
        var bytesRead = 0;
        for (var i = 0; i < length; i++) {
          var result;
          try {
            result = input();
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (result === undefined && bytesRead === 0) {
            throw new FS.ErrnoError(6);
          }
          if (result === null || result === undefined) break;
          bytesRead++;
          buffer[offset + i] = result;
        }
        if (bytesRead) {
          stream.node.timestamp = Date.now();
        }
        return bytesRead;
      },
      write: (stream, buffer, offset, length, pos) => {
        for (var i = 0; i < length; i++) {
          try {
            output(buffer[offset + i]);
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
        if (length) {
          stream.node.timestamp = Date.now();
        }
        return i;
      }
    });
    return FS.mkdev(path, mode, dev);
  }, forceLoadFile: (obj) => {
    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
    if (typeof XMLHttpRequest != 'undefined') {
      throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
    } else if (read_) {
      // Command-line.
      try {
        // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
        //          read() will try to parse UTF8.
        obj.contents = intArrayFromString(read_(obj.url), true);
        obj.usedBytes = obj.contents.length;
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
    } else {
      throw new Error('Cannot load without read() or XMLHttpRequest.');
    }
  }, createLazyFile: (parent, name, url, canRead, canWrite) => {
    // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
    /** @constructor */
    function LazyUint8Array() {
      this.lengthKnown = false;
      this.chunks = []; // Loaded chunks. Index is the chunk number
    }
    LazyUint8Array.prototype.get = /** @this{Object} */ function LazyUint8Array_get(idx) {
      if (idx > this.length - 1 || idx < 0) {
        return undefined;
      }
      var chunkOffset = idx % this.chunkSize;
      var chunkNum = (idx / this.chunkSize) | 0;
      return this.getter(chunkNum)[chunkOffset];
    };
    LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
      this.getter = getter;
    };
    LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
      // Find length
      var xhr = new XMLHttpRequest();
      xhr.open('HEAD', url, false);
      xhr.send(null);
      if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
      var datalength = Number(xhr.getResponseHeader("Content-length"));
      var header;
      var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
      var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";

      var chunkSize = 1024 * 1024; // Chunk size in bytes

      if (!hasByteServing) chunkSize = datalength;

      // Function to get a range from the remote URL.
      var doXHR = (from, to) => {
        if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
        if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");

        // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);

        // Some hints to the browser that we want binary data.
        xhr.responseType = 'arraybuffer';
        if (xhr.overrideMimeType) {
          xhr.overrideMimeType('text/plain; charset=x-user-defined');
        }

        xhr.send(null);
        if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
        if (xhr.response !== undefined) {
          return new Uint8Array(/** @type{Array<number>} */(xhr.response || []));
        } else {
          return intArrayFromString(xhr.responseText || '', true);
        }
      };
      var lazyArray = this;
      lazyArray.setDataGetter((chunkNum) => {
        var start = chunkNum * chunkSize;
        var end = (chunkNum + 1) * chunkSize - 1; // including this byte
        end = Math.min(end, datalength - 1); // if datalength-1 is selected, this is the last block
        if (typeof lazyArray.chunks[chunkNum] == 'undefined') {
          lazyArray.chunks[chunkNum] = doXHR(start, end);
        }
        if (typeof lazyArray.chunks[chunkNum] == 'undefined') throw new Error('doXHR failed!');
        return lazyArray.chunks[chunkNum];
      });

      if (usesGzip || !datalength) {
        // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
        chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
        datalength = this.getter(0).length;
        chunkSize = datalength;
        out("LazyFiles on gzip forces download of the whole file when length is accessed");
      }

      this._length = datalength;
      this._chunkSize = chunkSize;
      this.lengthKnown = true;
    };
    if (typeof XMLHttpRequest != 'undefined') {
      if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
      var lazyArray = new LazyUint8Array();
      Object.defineProperties(lazyArray, {
        length: {
          get: /** @this{Object} */ function () {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          }
        },
        chunkSize: {
          get: /** @this{Object} */ function () {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          }
        }
      });

      var properties = { isDevice: false, contents: lazyArray };
    } else {
      var properties = { isDevice: false, url: url };
    }

    var node = FS.createFile(parent, name, properties, canRead, canWrite);
    // This is a total hack, but I want to get this lazy file code out of the
    // core of MEMFS. If we want to keep this lazy file concept I feel it should
    // be its own thin LAZYFS proxying calls to MEMFS.
    if (properties.contents) {
      node.contents = properties.contents;
    } else if (properties.url) {
      node.contents = null;
      node.url = properties.url;
    }
    // Add a function that defers querying the file size until it is asked the first time.
    Object.defineProperties(node, {
      usedBytes: {
        get: /** @this {FSNode} */ function () { return this.contents.length; }
      }
    });
    // override each stream op with one that tries to force load the lazy file first
    var stream_ops = {};
    var keys = Object.keys(node.stream_ops);
    keys.forEach((key) => {
      var fn = node.stream_ops[key];
      stream_ops[key] = function forceLoadLazyFile() {
        FS.forceLoadFile(node);
        return fn.apply(null, arguments);
      };
    });
    // use a custom read function
    stream_ops.read = (stream, buffer, offset, length, position) => {
      FS.forceLoadFile(node);
      var contents = stream.node.contents;
      if (position >= contents.length)
        return 0;
      var size = Math.min(contents.length - position, length);
      assert(size >= 0);
      if (contents.slice) { // normal array
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents[position + i];
        }
      } else {
        for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
          buffer[offset + i] = contents.get(position + i);
        }
      }
      return size;
    };
    node.stream_ops = stream_ops;
    return node;
  }, createPreloadedFile: (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
    // TODO we should allow people to just pass in a complete filename instead
    // of parent and name being that we just join them anyways
    var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
    var dep = getUniqueRunDependency('cp ' + fullname); // might have several active requests for the same fullname
    function processData(byteArray) {
      function finish(byteArray) {
        if (preFinish) preFinish();
        if (!dontCreateFile) {
          FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
        }
        if (onload) onload();
        removeRunDependency(dep);
      }
      if (Browser.handledByPreloadPlugin(byteArray, fullname, finish, () => {
        if (onerror) onerror();
        removeRunDependency(dep);
      })) {
        return;
      }
      finish(byteArray);
    }
    addRunDependency(dep);
    if (typeof url == 'string') {
      asyncLoad(url, (byteArray) => processData(byteArray), onerror);
    } else {
      processData(url);
    }
  }, indexedDB: () => {
    return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
  }, DB_NAME: () => {
    return 'EM_FS_' + window.location.pathname;
  }, DB_VERSION: 20, DB_STORE_NAME: "FILE_DATA", saveFilesToDB: (paths, onload, onerror) => {
    onload = onload || (() => { });
    onerror = onerror || (() => { });
    var indexedDB = FS.indexedDB();
    try {
      var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
    } catch (e) {
      return onerror(e);
    }
    openRequest.onupgradeneeded = () => {
      out('creating db');
      var db = openRequest.result;
      db.createObjectStore(FS.DB_STORE_NAME);
    };
    openRequest.onsuccess = () => {
      var db = openRequest.result;
      var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
      var files = transaction.objectStore(FS.DB_STORE_NAME);
      var ok = 0, fail = 0, total = paths.length;
      function finish() {
        if (fail == 0) onload(); else onerror();
      }
      paths.forEach((path) => {
        var putRequest = files.put(FS.analyzePath(path).object.contents, path);
        putRequest.onsuccess = () => { ok++; if (ok + fail == total) finish() };
        putRequest.onerror = () => { fail++; if (ok + fail == total) finish() };
      });
      transaction.onerror = onerror;
    };
    openRequest.onerror = onerror;
  }, loadFilesFromDB: (paths, onload, onerror) => {
    onload = onload || (() => { });
    onerror = onerror || (() => { });
    var indexedDB = FS.indexedDB();
    try {
      var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
    } catch (e) {
      return onerror(e);
    }
    openRequest.onupgradeneeded = onerror; // no database to load from
    openRequest.onsuccess = () => {
      var db = openRequest.result;
      try {
        var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
      } catch (e) {
        onerror(e);
        return;
      }
      var files = transaction.objectStore(FS.DB_STORE_NAME);
      var ok = 0, fail = 0, total = paths.length;
      function finish() {
        if (fail == 0) onload(); else onerror();
      }
      paths.forEach((path) => {
        var getRequest = files.get(path);
        getRequest.onsuccess = () => {
          if (FS.analyzePath(path).exists) {
            FS.unlink(path);
          }
          FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
          ok++;
          if (ok + fail == total) finish();
        };
        getRequest.onerror = () => { fail++; if (ok + fail == total) finish() };
      });
      transaction.onerror = onerror;
    };
    openRequest.onerror = onerror;
  }, absolutePath: () => {
    abort('FS.absolutePath has been removed; use PATH_FS.resolve instead');
  }, createFolder: () => {
    abort('FS.createFolder has been removed; use FS.mkdir instead');
  }, createLink: () => {
    abort('FS.createLink has been removed; use FS.symlink instead');
  }, joinPath: () => {
    abort('FS.joinPath has been removed; use PATH.join instead');
  }, mmapAlloc: () => {
    abort('FS.mmapAlloc has been replaced by the top level function mmapAlloc');
  }, standardizePath: () => {
    abort('FS.standardizePath has been removed; use PATH.normalize instead');
  }
};
var SYSCALLS = {
  DEFAULT_POLLMASK: 5, calculateAt: function (dirfd, path, allowEmpty) {
    if (path[0] === '/') {
      return path;
    }
    // relative path
    var dir;
    if (dirfd === -100) {
      dir = FS.cwd();
    } else {
      var dirstream = FS.getStream(dirfd);
      if (!dirstream) throw new FS.ErrnoError(8);
      dir = dirstream.path;
    }
    if (path.length == 0) {
      if (!allowEmpty) {
        throw new FS.ErrnoError(44);;
      }
      return dir;
    }
    return PATH.join2(dir, path);
  }, doStat: function (func, path, buf) {
    try {
      var stat = func(path);
    } catch (e) {
      if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
        // an error occurred while trying to look up the path; we should just report ENOTDIR
        return -54;
      }
      throw e;
    }
    HEAP32[((buf) >> 2)] = stat.dev;
    HEAP32[(((buf) + (4)) >> 2)] = 0;
    HEAP32[(((buf) + (8)) >> 2)] = stat.ino;
    HEAP32[(((buf) + (12)) >> 2)] = stat.mode;
    HEAP32[(((buf) + (16)) >> 2)] = stat.nlink;
    HEAP32[(((buf) + (20)) >> 2)] = stat.uid;
    HEAP32[(((buf) + (24)) >> 2)] = stat.gid;
    HEAP32[(((buf) + (28)) >> 2)] = stat.rdev;
    HEAP32[(((buf) + (32)) >> 2)] = 0;
    (tempI64 = [stat.size >>> 0, (tempDouble = stat.size, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math.min((+(Math.floor((tempDouble) / 4294967296.0))), 4294967295.0)) | 0) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((buf) + (40)) >> 2)] = tempI64[0], HEAP32[(((buf) + (44)) >> 2)] = tempI64[1]);
    HEAP32[(((buf) + (48)) >> 2)] = 4096;
    HEAP32[(((buf) + (52)) >> 2)] = stat.blocks;
    HEAP32[(((buf) + (56)) >> 2)] = (stat.atime.getTime() / 1000) | 0;
    HEAP32[(((buf) + (60)) >> 2)] = 0;
    HEAP32[(((buf) + (64)) >> 2)] = (stat.mtime.getTime() / 1000) | 0;
    HEAP32[(((buf) + (68)) >> 2)] = 0;
    HEAP32[(((buf) + (72)) >> 2)] = (stat.ctime.getTime() / 1000) | 0;
    HEAP32[(((buf) + (76)) >> 2)] = 0;
    (tempI64 = [stat.ino >>> 0, (tempDouble = stat.ino, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math.min((+(Math.floor((tempDouble) / 4294967296.0))), 4294967295.0)) | 0) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((buf) + (80)) >> 2)] = tempI64[0], HEAP32[(((buf) + (84)) >> 2)] = tempI64[1]);
    return 0;
  }, doMsync: function (addr, stream, len, flags, offset) {
    var buffer = HEAPU8.slice(addr, addr + len);
    FS.msync(stream, buffer, offset, len, flags);
  }, doMkdir: function (path, mode) {
    // remove a trailing slash, if one - /a/b/ has basename of '', but
    // we want to create b in the context of this function
    path = PATH.normalize(path);
    if (path[path.length - 1] === '/') path = path.substr(0, path.length - 1);
    FS.mkdir(path, mode, 0);
    return 0;
  }, doMknod: function (path, mode, dev) {
    // we don't want this in the JS API as it uses mknod to create all nodes.
    switch (mode & 61440) {
      case 32768:
      case 8192:
      case 24576:
      case 4096:
      case 49152:
        break;
      default: return -28;
    }
    FS.mknod(path, mode, dev);
    return 0;
  }, doReadlink: function (path, buf, bufsize) {
    if (bufsize <= 0) return -28;
    var ret = FS.readlink(path);

    var len = Math.min(bufsize, lengthBytesUTF8(ret));
    var endChar = HEAP8[buf + len];
    stringToUTF8(ret, buf, bufsize + 1);
    // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
    // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
    HEAP8[buf + len] = endChar;

    return len;
  }, doAccess: function (path, amode) {
    if (amode & ~7) {
      // need a valid mode
      return -28;
    }
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    if (!node) {
      return -44;
    }
    var perms = '';
    if (amode & 4) perms += 'r';
    if (amode & 2) perms += 'w';
    if (amode & 1) perms += 'x';
    if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
      return -2;
    }
    return 0;
  }, doDup: function (path, flags, suggestFD) {
    var suggest = FS.getStream(suggestFD);
    if (suggest) FS.close(suggest);
    return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
  }, doReadv: function (stream, iov, iovcnt, offset) {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAP32[(((iov) + (i * 8)) >> 2)];
      var len = HEAP32[(((iov) + (i * 8 + 4)) >> 2)];
      var curr = FS.read(stream, HEAP8, ptr, len, offset);
      if (curr < 0) return -1;
      ret += curr;
      if (curr < len) break; // nothing more to read
    }
    return ret;
  }, doWritev: function (stream, iov, iovcnt, offset) {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAP32[(((iov) + (i * 8)) >> 2)];
      var len = HEAP32[(((iov) + (i * 8 + 4)) >> 2)];
      var curr = FS.write(stream, HEAP8, ptr, len, offset);
      if (curr < 0) return -1;
      ret += curr;
    }
    return ret;
  }, varargs: undefined, get: function () {
    assert(SYSCALLS.varargs != undefined);
    SYSCALLS.varargs += 4;
    var ret = HEAP32[(((SYSCALLS.varargs) - (4)) >> 2)];
    return ret;
  }, getStr: function (ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
  }, getStreamFromFD: function (fd) {
    var stream = FS.getStream(fd);
    if (!stream) throw new FS.ErrnoError(8);
    return stream;
  }, get64: function (low, high) {
    if (low >= 0) assert(high === 0);
    else assert(high === -1);
    return low;
  }
};
function ___syscall__newselect(nfds, readfds, writefds, exceptfds, timeout) {
  try {

    // readfds are supported,
    // writefds checks socket open status
    // exceptfds not supported
    // timeout is always 0 - fully async
    assert(nfds <= 64, 'nfds must be less than or equal to 64');  // fd sets have 64 bits // TODO: this could be 1024 based on current musl headers
    assert(!exceptfds, 'exceptfds not supported');

    var total = 0;

    var srcReadLow = (readfds ? HEAP32[((readfds) >> 2)] : 0),
      srcReadHigh = (readfds ? HEAP32[(((readfds) + (4)) >> 2)] : 0);
    var srcWriteLow = (writefds ? HEAP32[((writefds) >> 2)] : 0),
      srcWriteHigh = (writefds ? HEAP32[(((writefds) + (4)) >> 2)] : 0);
    var srcExceptLow = (exceptfds ? HEAP32[((exceptfds) >> 2)] : 0),
      srcExceptHigh = (exceptfds ? HEAP32[(((exceptfds) + (4)) >> 2)] : 0);

    var dstReadLow = 0,
      dstReadHigh = 0;
    var dstWriteLow = 0,
      dstWriteHigh = 0;
    var dstExceptLow = 0,
      dstExceptHigh = 0;

    var allLow = (readfds ? HEAP32[((readfds) >> 2)] : 0) |
      (writefds ? HEAP32[((writefds) >> 2)] : 0) |
      (exceptfds ? HEAP32[((exceptfds) >> 2)] : 0);
    var allHigh = (readfds ? HEAP32[(((readfds) + (4)) >> 2)] : 0) |
      (writefds ? HEAP32[(((writefds) + (4)) >> 2)] : 0) |
      (exceptfds ? HEAP32[(((exceptfds) + (4)) >> 2)] : 0);

    var check = function (fd, low, high, val) {
      return (fd < 32 ? (low & val) : (high & val));
    };

    for (var fd = 0; fd < nfds; fd++) {
      var mask = 1 << (fd % 32);
      if (!(check(fd, allLow, allHigh, mask))) {
        continue;  // index isn't in the set
      }

      var stream = FS.getStream(fd);
      if (!stream) throw new FS.ErrnoError(8);

      var flags = SYSCALLS.DEFAULT_POLLMASK;

      if (stream.stream_ops.poll) {
        flags = stream.stream_ops.poll(stream);
      }

      if ((flags & 1) && check(fd, srcReadLow, srcReadHigh, mask)) {
        fd < 32 ? (dstReadLow = dstReadLow | mask) : (dstReadHigh = dstReadHigh | mask);
        total++;
      }
      if ((flags & 4) && check(fd, srcWriteLow, srcWriteHigh, mask)) {
        fd < 32 ? (dstWriteLow = dstWriteLow | mask) : (dstWriteHigh = dstWriteHigh | mask);
        total++;
      }
      if ((flags & 2) && check(fd, srcExceptLow, srcExceptHigh, mask)) {
        fd < 32 ? (dstExceptLow = dstExceptLow | mask) : (dstExceptHigh = dstExceptHigh | mask);
        total++;
      }
    }

    if (readfds) {
      HEAP32[((readfds) >> 2)] = dstReadLow;
      HEAP32[(((readfds) + (4)) >> 2)] = dstReadHigh;
    }
    if (writefds) {
      HEAP32[((writefds) >> 2)] = dstWriteLow;
      HEAP32[(((writefds) + (4)) >> 2)] = dstWriteHigh;
    }
    if (exceptfds) {
      HEAP32[((exceptfds) >> 2)] = dstExceptLow;
      HEAP32[(((exceptfds) + (4)) >> 2)] = dstExceptHigh;
    }

    return total;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

var SOCKFS = {
  mount: function (mount) {
    // If Module['websocket'] has already been defined (e.g. for configuring
    // the subprotocol/url) use that, if not initialise it to a new object.
    Module['websocket'] = (Module['websocket'] &&
      ('object' === typeof Module['websocket'])) ? Module['websocket'] : {};

    // Add the Event registration mechanism to the exported websocket configuration
    // object so we can register network callbacks from native JavaScript too.
    // For more documentation see system/include/emscripten/emscripten.h
    Module['websocket']._callbacks = {};
    Module['websocket']['on'] = /** @this{Object} */ function (event, callback) {
      if ('function' === typeof callback) {
        this._callbacks[event] = callback;
      }
      return this;
    };

    Module['websocket'].emit = /** @this{Object} */ function (event, param) {
      if ('function' === typeof this._callbacks[event]) {
        this._callbacks[event].call(this, param);
      }
    };

    // If debug is enabled register simple default logging callbacks for each Event.

    return FS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
  }, createSocket: function (family, type, protocol) {
    type &= ~526336; // Some applications may pass it; it makes no sense for a single process.
    var streaming = type == 1;
    if (protocol) {
      assert(streaming == (protocol == 6)); // if SOCK_STREAM, must be tcp
    }

    // create our internal socket structure
    var sock = {
      family: family,
      type: type,
      protocol: protocol,
      server: null,
      error: null, // Used in getsockopt for SOL_SOCKET/SO_ERROR test
      peers: {},
      pending: [],
      recv_queue: [],
      sock_ops: SOCKFS.websocket_sock_ops
    };

    // create the filesystem node to store the socket structure
    var name = SOCKFS.nextname();
    var node = FS.createNode(SOCKFS.root, name, 49152, 0);
    node.sock = sock;

    // and the wrapping stream that enables library functions such
    // as read and write to indirectly interact with the socket
    var stream = FS.createStream({
      path: name,
      node: node,
      flags: 2,
      seekable: false,
      stream_ops: SOCKFS.stream_ops
    });

    // map the new stream to the socket structure (sockets have a 1:1
    // relationship with a stream)
    sock.stream = stream;

    return sock;
  }, getSocket: function (fd) {
    var stream = FS.getStream(fd);
    if (!stream || !FS.isSocket(stream.node.mode)) {
      return null;
    }
    return stream.node.sock;
  }, stream_ops: {
    poll: function (stream) {
      var sock = stream.node.sock;
      return sock.sock_ops.poll(sock);
    }, ioctl: function (stream, request, varargs) {
      var sock = stream.node.sock;
      return sock.sock_ops.ioctl(sock, request, varargs);
    }, read: function (stream, buffer, offset, length, position /* ignored */) {
      var sock = stream.node.sock;
      var msg = sock.sock_ops.recvmsg(sock, length);
      if (!msg) {
        // socket is closed
        return 0;
      }
      buffer.set(msg.buffer, offset);
      return msg.buffer.length;
    }, write: function (stream, buffer, offset, length, position /* ignored */) {
      var sock = stream.node.sock;
      return sock.sock_ops.sendmsg(sock, buffer, offset, length);
    }, close: function (stream) {
      var sock = stream.node.sock;
      sock.sock_ops.close(sock);
    }
  }, nextname: function () {
    if (!SOCKFS.nextname.current) {
      SOCKFS.nextname.current = 0;
    }
    return 'socket[' + (SOCKFS.nextname.current++) + ']';
  }, websocket_sock_ops: {
    createPeer: function (sock, addr, port) {
      var ws;

      if (typeof addr == 'object') {
        ws = addr;
        addr = null;
        port = null;
      }

      if (ws) {
        // for sockets that've already connected (e.g. we're the server)
        // we can inspect the _socket property for the address
        if (ws._socket) {
          addr = ws._socket.remoteAddress;
          port = ws._socket.remotePort;
        }
        // if we're just now initializing a connection to the remote,
        // inspect the url property
        else {
          var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
          if (!result) {
            throw new Error('WebSocket URL must be in the format ws(s)://address:port');
          }
          addr = result[1];
          port = parseInt(result[2], 10);
        }
      } else {
        // create the actual websocket object and connect
        try {
          // runtimeConfig gets set to true if WebSocket runtime configuration is available.
          var runtimeConfig = (Module['websocket'] && ('object' === typeof Module['websocket']));

          // The default value is 'ws://' the replace is needed because the compiler replaces '//' comments with '#'
          // comments without checking context, so we'd end up with ws:#, the replace swaps the '#' for '//' again.
          var url = 'ws:#'.replace('#', '//');

          if (runtimeConfig) {
            if ('string' === typeof Module['websocket']['url']) {
              url = Module['websocket']['url']; // Fetch runtime WebSocket URL config.
            }
          }

          if (url === 'ws://' || url === 'wss://') { // Is the supplied URL config just a prefix, if so complete it.
            var parts = addr.split('/');
            url = url + parts[0] + ":" + port + "/" + parts.slice(1).join('/');
          }

          // Make the WebSocket subprotocol (Sec-WebSocket-Protocol) default to binary if no configuration is set.
          var subProtocols = 'binary'; // The default value is 'binary'

          if (runtimeConfig) {
            if ('string' === typeof Module['websocket']['subprotocol']) {
              subProtocols = Module['websocket']['subprotocol']; // Fetch runtime WebSocket subprotocol config.
            }
          }

          // The default WebSocket options
          var opts = undefined;

          if (subProtocols !== 'null') {
            // The regex trims the string (removes spaces at the beginning and end, then splits the string by
            // <any space>,<any space> into an Array. Whitespace removal is important for Websockify and ws.
            subProtocols = subProtocols.replace(/^ +| +$/g, "").split(/ *, */);

            // The node ws library API for specifying optional subprotocol is slightly different than the browser's.
            opts = ENVIRONMENT_IS_NODE ? { 'protocol': subProtocols.toString() } : subProtocols;
          }

          // some webservers (azure) does not support subprotocol header
          if (runtimeConfig && null === Module['websocket']['subprotocol']) {
            subProtocols = 'null';
            opts = undefined;
          }

          // If node we use the ws library.
          var WebSocketConstructor;
          if (ENVIRONMENT_IS_NODE) {
            WebSocketConstructor = /** @type{(typeof WebSocket)} */(require('ws'));
          } else {
            WebSocketConstructor = WebSocket;
          }
          ws = new WebSocketConstructor(url, opts);
          ws.binaryType = 'arraybuffer';
        } catch (e) {
          throw new FS.ErrnoError(23);
        }
      }

      var peer = {
        addr: addr,
        port: port,
        socket: ws,
        dgram_send_queue: []
      };

      SOCKFS.websocket_sock_ops.addPeer(sock, peer);
      SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);

      // if this is a bound dgram socket, send the port number first to allow
      // us to override the ephemeral port reported to us by remotePort on the
      // remote end.
      if (sock.type === 2 && typeof sock.sport != 'undefined') {
        peer.dgram_send_queue.push(new Uint8Array([
          255, 255, 255, 255,
          'p'.charCodeAt(0), 'o'.charCodeAt(0), 'r'.charCodeAt(0), 't'.charCodeAt(0),
          ((sock.sport & 0xff00) >> 8), (sock.sport & 0xff)
        ]));
      }

      return peer;
    }, getPeer: function (sock, addr, port) {
      return sock.peers[addr + ':' + port];
    }, addPeer: function (sock, peer) {
      sock.peers[peer.addr + ':' + peer.port] = peer;
    }, removePeer: function (sock, peer) {
      delete sock.peers[peer.addr + ':' + peer.port];
    }, handlePeerEvents: function (sock, peer) {
      var first = true;

      var handleOpen = function () {

        Module['websocket'].emit('open', sock.stream.fd);

        try {
          var queued = peer.dgram_send_queue.shift();
          while (queued) {
            peer.socket.send(queued);
            queued = peer.dgram_send_queue.shift();
          }
        } catch (e) {
          // not much we can do here in the way of proper error handling as we've already
          // lied and said this data was sent. shut it down.
          peer.socket.close();
        }
      };

      function handleMessage(data) {
        if (typeof data == 'string') {
          var encoder = new TextEncoder(); // should be utf-8
          data = encoder.encode(data); // make a typed array from the string
        } else {
          assert(data.byteLength !== undefined); // must receive an ArrayBuffer
          if (data.byteLength == 0) {
            // An empty ArrayBuffer will emit a pseudo disconnect event
            // as recv/recvmsg will return zero which indicates that a socket
            // has performed a shutdown although the connection has not been disconnected yet.
            return;
          } else {
            data = new Uint8Array(data); // make a typed array view on the array buffer
          }
        }

        // if this is the port message, override the peer's port with it
        var wasfirst = first;
        first = false;
        if (wasfirst &&
          data.length === 10 &&
          data[0] === 255 && data[1] === 255 && data[2] === 255 && data[3] === 255 &&
          data[4] === 'p'.charCodeAt(0) && data[5] === 'o'.charCodeAt(0) && data[6] === 'r'.charCodeAt(0) && data[7] === 't'.charCodeAt(0)) {
          // update the peer's port and it's key in the peer map
          var newport = ((data[8] << 8) | data[9]);
          SOCKFS.websocket_sock_ops.removePeer(sock, peer);
          peer.port = newport;
          SOCKFS.websocket_sock_ops.addPeer(sock, peer);
          return;
        }

        sock.recv_queue.push({ addr: peer.addr, port: peer.port, data: data });
        Module['websocket'].emit('message', sock.stream.fd);
      };

      if (ENVIRONMENT_IS_NODE) {
        peer.socket.on('open', handleOpen);
        peer.socket.on('message', function (data, flags) {
          if (!flags.binary) {
            return;
          }
          handleMessage((new Uint8Array(data)).buffer);  // copy from node Buffer -> ArrayBuffer
        });
        peer.socket.on('close', function () {
          Module['websocket'].emit('close', sock.stream.fd);
        });
        peer.socket.on('error', function (error) {
          // Although the ws library may pass errors that may be more descriptive than
          // ECONNREFUSED they are not necessarily the expected error code e.g. 
          // ENOTFOUND on getaddrinfo seems to be node.js specific, so using ECONNREFUSED
          // is still probably the most useful thing to do.
          sock.error = 14; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
          Module['websocket'].emit('error', [sock.stream.fd, sock.error, 'ECONNREFUSED: Connection refused']);
          // don't throw
        });
      } else {
        peer.socket.onopen = handleOpen;
        peer.socket.onclose = function () {
          Module['websocket'].emit('close', sock.stream.fd);
        };
        peer.socket.onmessage = function peer_socket_onmessage(event) {
          handleMessage(event.data);
        };
        peer.socket.onerror = function (error) {
          // The WebSocket spec only allows a 'simple event' to be thrown on error,
          // so we only really know as much as ECONNREFUSED.
          sock.error = 14; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
          Module['websocket'].emit('error', [sock.stream.fd, sock.error, 'ECONNREFUSED: Connection refused']);
        };
      }
    }, poll: function (sock) {
      if (sock.type === 1 && sock.server) {
        // listen sockets should only say they're available for reading
        // if there are pending clients.
        return sock.pending.length ? (64 | 1) : 0;
      }

      var mask = 0;
      var dest = sock.type === 1 ?  // we only care about the socket state for connection-based sockets
        SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport) :
        null;

      if (sock.recv_queue.length ||
        !dest ||  // connection-less sockets are always ready to read
        (dest && dest.socket.readyState === dest.socket.CLOSING) ||
        (dest && dest.socket.readyState === dest.socket.CLOSED)) {  // let recv return 0 once closed
        mask |= (64 | 1);
      }

      if (!dest ||  // connection-less sockets are always ready to write
        (dest && dest.socket.readyState === dest.socket.OPEN)) {
        mask |= 4;
      }

      if ((dest && dest.socket.readyState === dest.socket.CLOSING) ||
        (dest && dest.socket.readyState === dest.socket.CLOSED)) {
        mask |= 16;
      }

      return mask;
    }, ioctl: function (sock, request, arg) {
      switch (request) {
        case 21531:
          var bytes = 0;
          if (sock.recv_queue.length) {
            bytes = sock.recv_queue[0].data.length;
          }
          HEAP32[((arg) >> 2)] = bytes;
          return 0;
        default:
          return 28;
      }
    }, close: function (sock) {
      // if we've spawned a listen server, close it
      if (sock.server) {
        try {
          sock.server.close();
        } catch (e) {
        }
        sock.server = null;
      }
      // close any peer connections
      var peers = Object.keys(sock.peers);
      for (var i = 0; i < peers.length; i++) {
        var peer = sock.peers[peers[i]];
        try {
          peer.socket.close();
        } catch (e) {
        }
        SOCKFS.websocket_sock_ops.removePeer(sock, peer);
      }
      return 0;
    }, bind: function (sock, addr, port) {
      if (typeof sock.saddr != 'undefined' || typeof sock.sport != 'undefined') {
        throw new FS.ErrnoError(28);  // already bound
      }
      sock.saddr = addr;
      sock.sport = port;
      // in order to emulate dgram sockets, we need to launch a listen server when
      // binding on a connection-less socket
      // note: this is only required on the server side
      if (sock.type === 2) {
        // close the existing server if it exists
        if (sock.server) {
          sock.server.close();
          sock.server = null;
        }
        // swallow error operation not supported error that occurs when binding in the
        // browser where this isn't supported
        try {
          sock.sock_ops.listen(sock, 0);
        } catch (e) {
          if (!(e instanceof FS.ErrnoError)) throw e;
          if (e.errno !== 138) throw e;
        }
      }
    }, connect: function (sock, addr, port) {
      if (sock.server) {
        throw new FS.ErrnoError(138);
      }

      // TODO autobind
      // if (!sock.addr && sock.type == 2) {
      // }

      // early out if we're already connected / in the middle of connecting
      if (typeof sock.daddr != 'undefined' && typeof sock.dport != 'undefined') {
        var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
        if (dest) {
          if (dest.socket.readyState === dest.socket.CONNECTING) {
            throw new FS.ErrnoError(7);
          } else {
            throw new FS.ErrnoError(30);
          }
        }
      }

      // add the socket to our peer list and set our
      // destination address / port to match
      var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
      sock.daddr = peer.addr;
      sock.dport = peer.port;

      // always "fail" in non-blocking mode
      throw new FS.ErrnoError(26);
    }, listen: function (sock, backlog) {
      if (!ENVIRONMENT_IS_NODE) {
        throw new FS.ErrnoError(138);
      }
      if (sock.server) {
        throw new FS.ErrnoError(28);  // already listening
      }
      var WebSocketServer = require('ws').Server;
      var host = sock.saddr;
      sock.server = new WebSocketServer({
        host: host,
        port: sock.sport
        // TODO support backlog
      });
      Module['websocket'].emit('listen', sock.stream.fd); // Send Event with listen fd.

      sock.server.on('connection', function (ws) {
        if (sock.type === 1) {
          var newsock = SOCKFS.createSocket(sock.family, sock.type, sock.protocol);

          // create a peer on the new socket
          var peer = SOCKFS.websocket_sock_ops.createPeer(newsock, ws);
          newsock.daddr = peer.addr;
          newsock.dport = peer.port;

          // push to queue for accept to pick up
          sock.pending.push(newsock);
          Module['websocket'].emit('connection', newsock.stream.fd);
        } else {
          // create a peer on the listen socket so calling sendto
          // with the listen socket and an address will resolve
          // to the correct client
          SOCKFS.websocket_sock_ops.createPeer(sock, ws);
          Module['websocket'].emit('connection', sock.stream.fd);
        }
      });
      sock.server.on('closed', function () {
        Module['websocket'].emit('close', sock.stream.fd);
        sock.server = null;
      });
      sock.server.on('error', function (error) {
        // Although the ws library may pass errors that may be more descriptive than
        // ECONNREFUSED they are not necessarily the expected error code e.g. 
        // ENOTFOUND on getaddrinfo seems to be node.js specific, so using EHOSTUNREACH
        // is still probably the most useful thing to do. This error shouldn't
        // occur in a well written app as errors should get trapped in the compiled
        // app's own getaddrinfo call.
        sock.error = 23; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
        Module['websocket'].emit('error', [sock.stream.fd, sock.error, 'EHOSTUNREACH: Host is unreachable']);
        // don't throw
      });
    }, accept: function (listensock) {
      if (!listensock.server) {
        throw new FS.ErrnoError(28);
      }
      var newsock = listensock.pending.shift();
      newsock.stream.flags = listensock.stream.flags;
      return newsock;
    }, getname: function (sock, peer) {
      var addr, port;
      if (peer) {
        if (sock.daddr === undefined || sock.dport === undefined) {
          throw new FS.ErrnoError(53);
        }
        addr = sock.daddr;
        port = sock.dport;
      } else {
        // TODO saddr and sport will be set for bind()'d UDP sockets, but what
        // should we be returning for TCP sockets that've been connect()'d?
        addr = sock.saddr || 0;
        port = sock.sport || 0;
      }
      return { addr: addr, port: port };
    }, sendmsg: function (sock, buffer, offset, length, addr, port) {
      if (sock.type === 2) {
        // connection-less sockets will honor the message address,
        // and otherwise fall back to the bound destination address
        if (addr === undefined || port === undefined) {
          addr = sock.daddr;
          port = sock.dport;
        }
        // if there was no address to fall back to, error out
        if (addr === undefined || port === undefined) {
          throw new FS.ErrnoError(17);
        }
      } else {
        // connection-based sockets will only use the bound
        addr = sock.daddr;
        port = sock.dport;
      }

      // find the peer for the destination address
      var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);

      // early out if not connected with a connection-based socket
      if (sock.type === 1) {
        if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
          throw new FS.ErrnoError(53);
        } else if (dest.socket.readyState === dest.socket.CONNECTING) {
          throw new FS.ErrnoError(6);
        }
      }

      // create a copy of the incoming data to send, as the WebSocket API
      // doesn't work entirely with an ArrayBufferView, it'll just send
      // the entire underlying buffer
      if (ArrayBuffer.isView(buffer)) {
        offset += buffer.byteOffset;
        buffer = buffer.buffer;
      }

      var data;
      data = buffer.slice(offset, offset + length);

      // if we're emulating a connection-less dgram socket and don't have
      // a cached connection, queue the buffer to send upon connect and
      // lie, saying the data was sent now.
      if (sock.type === 2) {
        if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
          // if we're not connected, open a new connection
          if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
            dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
          }
          dest.dgram_send_queue.push(data);
          return length;
        }
      }

      try {
        // send the actual data
        dest.socket.send(data);
        return length;
      } catch (e) {
        throw new FS.ErrnoError(28);
      }
    }, recvmsg: function (sock, length) {
      // http://pubs.opengroup.org/onlinepubs/7908799/xns/recvmsg.html
      if (sock.type === 1 && sock.server) {
        // tcp servers should not be recv()'ing on the listen socket
        throw new FS.ErrnoError(53);
      }

      var queued = sock.recv_queue.shift();
      if (!queued) {
        if (sock.type === 1) {
          var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);

          if (!dest) {
            // if we have a destination address but are not connected, error out
            throw new FS.ErrnoError(53);
          }
          else if (dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
            // return null if the socket has closed
            return null;
          }
          else {
            // else, our socket is in a valid state but truly has nothing available
            throw new FS.ErrnoError(6);
          }
        } else {
          throw new FS.ErrnoError(6);
        }
      }

      // queued.data will be an ArrayBuffer if it's unadulterated, but if it's
      // requeued TCP data it'll be an ArrayBufferView
      var queuedLength = queued.data.byteLength || queued.data.length;
      var queuedOffset = queued.data.byteOffset || 0;
      var queuedBuffer = queued.data.buffer || queued.data;
      var bytesRead = Math.min(length, queuedLength);
      var res = {
        buffer: new Uint8Array(queuedBuffer, queuedOffset, bytesRead),
        addr: queued.addr,
        port: queued.port
      };

      // push back any unread data for TCP connections
      if (sock.type === 1 && bytesRead < queuedLength) {
        var bytesRemaining = queuedLength - bytesRead;
        queued.data = new Uint8Array(queuedBuffer, queuedOffset + bytesRead, bytesRemaining);
        sock.recv_queue.unshift(queued);
      }

      return res;
    }
  }
};
function getSocketFromFD(fd) {
  var socket = SOCKFS.getSocket(fd);
  if (!socket) throw new FS.ErrnoError(8);
  return socket;
}

function setErrNo(value) {
  HEAP32[((___errno_location()) >> 2)] = value;
  return value;
}
var Sockets = { BUFFER_SIZE: 10240, MAX_BUFFER_SIZE: 10485760, nextFd: 1, fds: {}, nextport: 1, maxport: 65535, peer: null, connections: {}, portmap: {}, localAddr: 4261412874, addrPool: [33554442, 50331658, 67108874, 83886090, 100663306, 117440522, 134217738, 150994954, 167772170, 184549386, 201326602, 218103818, 234881034] };

function inetNtop4(addr) {
  return (addr & 0xff) + '.' + ((addr >> 8) & 0xff) + '.' + ((addr >> 16) & 0xff) + '.' + ((addr >> 24) & 0xff)
}

function inetNtop6(ints) {
  //  ref:  http://www.ietf.org/rfc/rfc2373.txt - section 2.5.4
  //  Format for IPv4 compatible and mapped  128-bit IPv6 Addresses
  //  128-bits are split into eight 16-bit words
  //  stored in network byte order (big-endian)
  //  |                80 bits               | 16 |      32 bits        |
  //  +-----------------------------------------------------------------+
  //  |               10 bytes               |  2 |      4 bytes        |
  //  +--------------------------------------+--------------------------+
  //  +               5 words                |  1 |      2 words        |
  //  +--------------------------------------+--------------------------+
  //  |0000..............................0000|0000|    IPv4 ADDRESS     | (compatible)
  //  +--------------------------------------+----+---------------------+
  //  |0000..............................0000|FFFF|    IPv4 ADDRESS     | (mapped)
  //  +--------------------------------------+----+---------------------+
  var str = "";
  var word = 0;
  var longest = 0;
  var lastzero = 0;
  var zstart = 0;
  var len = 0;
  var i = 0;
  var parts = [
    ints[0] & 0xffff,
    (ints[0] >> 16),
    ints[1] & 0xffff,
    (ints[1] >> 16),
    ints[2] & 0xffff,
    (ints[2] >> 16),
    ints[3] & 0xffff,
    (ints[3] >> 16)
  ];

  // Handle IPv4-compatible, IPv4-mapped, loopback and any/unspecified addresses

  var hasipv4 = true;
  var v4part = "";
  // check if the 10 high-order bytes are all zeros (first 5 words)
  for (i = 0; i < 5; i++) {
    if (parts[i] !== 0) { hasipv4 = false; break; }
  }

  if (hasipv4) {
    // low-order 32-bits store an IPv4 address (bytes 13 to 16) (last 2 words)
    v4part = inetNtop4(parts[6] | (parts[7] << 16));
    // IPv4-mapped IPv6 address if 16-bit value (bytes 11 and 12) == 0xFFFF (6th word)
    if (parts[5] === -1) {
      str = "::ffff:";
      str += v4part;
      return str;
    }
    // IPv4-compatible IPv6 address if 16-bit value (bytes 11 and 12) == 0x0000 (6th word)
    if (parts[5] === 0) {
      str = "::";
      //special case IPv6 addresses
      if (v4part === "0.0.0.0") v4part = ""; // any/unspecified address
      if (v4part === "0.0.0.1") v4part = "1";// loopback address
      str += v4part;
      return str;
    }
  }

  // Handle all other IPv6 addresses

  // first run to find the longest contiguous zero words
  for (word = 0; word < 8; word++) {
    if (parts[word] === 0) {
      if (word - lastzero > 1) {
        len = 0;
      }
      lastzero = word;
      len++;
    }
    if (len > longest) {
      longest = len;
      zstart = word - longest + 1;
    }
  }

  for (word = 0; word < 8; word++) {
    if (longest > 1) {
      // compress contiguous zeros - to produce "::"
      if (parts[word] === 0 && word >= zstart && word < (zstart + longest)) {
        if (word === zstart) {
          str += ":";
          if (zstart === 0) str += ":"; //leading zeros case
        }
        continue;
      }
    }
    // converts 16-bit words from big-endian to little-endian before converting to hex string
    str += Number(_ntohs(parts[word] & 0xffff)).toString(16);
    str += word < 7 ? ":" : "";
  }
  return str;
}
function readSockaddr(sa, salen) {
  // family / port offsets are common to both sockaddr_in and sockaddr_in6
  var family = HEAP16[((sa) >> 1)];
  var port = _ntohs(HEAPU16[(((sa) + (2)) >> 1)]);
  var addr;

  switch (family) {
    case 2:
      if (salen !== 16) {
        return { errno: 28 };
      }
      addr = HEAP32[(((sa) + (4)) >> 2)];
      addr = inetNtop4(addr);
      break;
    case 10:
      if (salen !== 28) {
        return { errno: 28 };
      }
      addr = [
        HEAP32[(((sa) + (8)) >> 2)],
        HEAP32[(((sa) + (12)) >> 2)],
        HEAP32[(((sa) + (16)) >> 2)],
        HEAP32[(((sa) + (20)) >> 2)]
      ];
      addr = inetNtop6(addr);
      break;
    default:
      return { errno: 5 };
  }

  return { family: family, addr: addr, port: port };
}

function inetPton4(str) {
  var b = str.split('.');
  for (var i = 0; i < 4; i++) {
    var tmp = Number(b[i]);
    if (isNaN(tmp)) return null;
    b[i] = tmp;
  }
  return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
}

/** @suppress {checkTypes} */
function jstoi_q(str) {
  return parseInt(str);
}
function inetPton6(str) {
  var words;
  var w, offset, z, i;
  /* http://home.deds.nl/~aeron/regex/ */
  var valid6regx = /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i
  var parts = [];
  if (!valid6regx.test(str)) {
    return null;
  }
  if (str === "::") {
    return [0, 0, 0, 0, 0, 0, 0, 0];
  }
  // Z placeholder to keep track of zeros when splitting the string on ":"
  if (str.startsWith("::")) {
    str = str.replace("::", "Z:"); // leading zeros case
  } else {
    str = str.replace("::", ":Z:");
  }

  if (str.indexOf(".") > 0) {
    // parse IPv4 embedded stress
    str = str.replace(new RegExp('[.]', 'g'), ":");
    words = str.split(":");
    words[words.length - 4] = jstoi_q(words[words.length - 4]) + jstoi_q(words[words.length - 3]) * 256;
    words[words.length - 3] = jstoi_q(words[words.length - 2]) + jstoi_q(words[words.length - 1]) * 256;
    words = words.slice(0, words.length - 2);
  } else {
    words = str.split(":");
  }

  offset = 0; z = 0;
  for (w = 0; w < words.length; w++) {
    if (typeof words[w] == 'string') {
      if (words[w] === 'Z') {
        // compressed zeros - write appropriate number of zero words
        for (z = 0; z < (8 - words.length + 1); z++) {
          parts[w + z] = 0;
        }
        offset = z - 1;
      } else {
        // parse hex to field to 16-bit value and write it in network byte-order
        parts[w + offset] = _htons(parseInt(words[w], 16));
      }
    } else {
      // parsed IPv4 words
      parts[w + offset] = words[w];
    }
  }
  return [
    (parts[1] << 16) | parts[0],
    (parts[3] << 16) | parts[2],
    (parts[5] << 16) | parts[4],
    (parts[7] << 16) | parts[6]
  ];
}
var DNS = {
  address_map: { id: 1, addrs: {}, names: {} }, lookup_name: function (name) {
    // If the name is already a valid ipv4 / ipv6 address, don't generate a fake one.
    var res = inetPton4(name);
    if (res !== null) {
      return name;
    }
    res = inetPton6(name);
    if (res !== null) {
      return name;
    }

    // See if this name is already mapped.
    var addr;

    if (DNS.address_map.addrs[name]) {
      addr = DNS.address_map.addrs[name];
    } else {
      var id = DNS.address_map.id++;
      assert(id < 65535, 'exceeded max address mappings of 65535');

      addr = '172.29.' + (id & 0xff) + '.' + (id & 0xff00);

      DNS.address_map.names[addr] = name;
      DNS.address_map.addrs[name] = addr;
    }

    return addr;
  }, lookup_addr: function (addr) {
    if (DNS.address_map.names[addr]) {
      return DNS.address_map.names[addr];
    }

    return null;
  }
};
/** @param {boolean=} allowNull */
function getSocketAddress(addrp, addrlen, allowNull) {
  if (allowNull && addrp === 0) return null;
  var info = readSockaddr(addrp, addrlen);
  if (info.errno) throw new FS.ErrnoError(info.errno);
  info.addr = DNS.lookup_addr(info.addr) || info.addr;
  return info;
}
function ___syscall_bind(fd, addr, addrlen) {
  try {

    var sock = getSocketFromFD(fd);
    var info = getSocketAddress(addr, addrlen);
    sock.sock_ops.bind(sock, info.addr, info.port);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_fcntl64(fd, cmd, varargs) {
  SYSCALLS.varargs = varargs;
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    switch (cmd) {
      case 0: {
        var arg = SYSCALLS.get();
        if (arg < 0) {
          return -28;
        }
        var newStream;
        newStream = FS.open(stream.path, stream.flags, 0, arg);
        return newStream.fd;
      }
      case 1:
      case 2:
        return 0;  // FD_CLOEXEC makes no sense for a single process.
      case 3:
        return stream.flags;
      case 4: {
        var arg = SYSCALLS.get();
        stream.flags |= arg;
        return 0;
      }
      case 5:
        /* case 5: Currently in musl F_GETLK64 has same value as F_GETLK, so omitted to avoid duplicate case blocks. If that changes, uncomment this */ {

          var arg = SYSCALLS.get();
          var offset = 0;
          // We're always unlocked.
          HEAP16[(((arg) + (offset)) >> 1)] = 2;
          return 0;
        }
      case 6:
      case 7:
        /* case 6: Currently in musl F_SETLK64 has same value as F_SETLK, so omitted to avoid duplicate case blocks. If that changes, uncomment this */
        /* case 7: Currently in musl F_SETLKW64 has same value as F_SETLKW, so omitted to avoid duplicate case blocks. If that changes, uncomment this */


        return 0; // Pretend that the locking is successful.
      case 16:
      case 8:
        return -28; // These are for sockets. We don't have them fully implemented yet.
      case 9:
        // musl trusts getown return values, due to a bug where they must be, as they overlap with errors. just return -1 here, so fnctl() returns that, and we set errno ourselves.
        setErrNo(28);
        return -1;
      default: {
        return -28;
      }
    }
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_fstat64(fd, buf) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    return SYSCALLS.doStat(FS.stat, stream.path, buf);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_fstatat64(dirfd, path, buf, flags) {
  try {

    path = SYSCALLS.getStr(path);
    var nofollow = flags & 256;
    var allowEmpty = flags & 4096;
    flags = flags & (~4352);
    assert(!flags, flags);
    path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
    return SYSCALLS.doStat(nofollow ? FS.lstat : FS.stat, path, buf);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_getdents64(fd, dirp, count) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd)
    if (!stream.getdents) {
      stream.getdents = FS.readdir(stream.path);
    }

    var struct_size = 280;
    var pos = 0;
    var off = FS.llseek(stream, 0, 1);

    var idx = Math.floor(off / struct_size);

    while (idx < stream.getdents.length && pos + struct_size <= count) {
      var id;
      var type;
      var name = stream.getdents[idx];
      if (name === '.') {
        id = stream.node.id;
        type = 4; // DT_DIR
      }
      else if (name === '..') {
        var lookup = FS.lookupPath(stream.path, { parent: true });
        id = lookup.node.id;
        type = 4; // DT_DIR
      }
      else {
        var child = FS.lookupNode(stream.node, name);
        id = child.id;
        type = FS.isChrdev(child.mode) ? 2 :  // DT_CHR, character device.
          FS.isDir(child.mode) ? 4 :     // DT_DIR, directory.
            FS.isLink(child.mode) ? 10 :   // DT_LNK, symbolic link.
              8;                             // DT_REG, regular file.
      }
      assert(id);
      (tempI64 = [id >>> 0, (tempDouble = id, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math.min((+(Math.floor((tempDouble) / 4294967296.0))), 4294967295.0)) | 0) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[((dirp + pos) >> 2)] = tempI64[0], HEAP32[(((dirp + pos) + (4)) >> 2)] = tempI64[1]);
      (tempI64 = [(idx + 1) * struct_size >>> 0, (tempDouble = (idx + 1) * struct_size, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math.min((+(Math.floor((tempDouble) / 4294967296.0))), 4294967295.0)) | 0) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[(((dirp + pos) + (8)) >> 2)] = tempI64[0], HEAP32[(((dirp + pos) + (12)) >> 2)] = tempI64[1]);
      HEAP16[(((dirp + pos) + (16)) >> 1)] = 280;
      HEAP8[(((dirp + pos) + (18)) >> 0)] = type;
      stringToUTF8(name, dirp + pos + 19, 256);
      pos += struct_size;
      idx += 1;
    }
    FS.llseek(stream, idx * struct_size, 0);
    return pos;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

/** @param {number=} addrlen */
function writeSockaddr(sa, family, addr, port, addrlen) {
  switch (family) {
    case 2:
      addr = inetPton4(addr);
      zeroMemory(sa, 16);
      if (addrlen) {
        HEAP32[((addrlen) >> 2)] = 16;
      }
      HEAP16[((sa) >> 1)] = family;
      HEAP32[(((sa) + (4)) >> 2)] = addr;
      HEAP16[(((sa) + (2)) >> 1)] = _htons(port);
      break;
    case 10:
      addr = inetPton6(addr);
      zeroMemory(sa, 28);
      if (addrlen) {
        HEAP32[((addrlen) >> 2)] = 28;
      }
      HEAP32[((sa) >> 2)] = family;
      HEAP32[(((sa) + (8)) >> 2)] = addr[0];
      HEAP32[(((sa) + (12)) >> 2)] = addr[1];
      HEAP32[(((sa) + (16)) >> 2)] = addr[2];
      HEAP32[(((sa) + (20)) >> 2)] = addr[3];
      HEAP16[(((sa) + (2)) >> 1)] = _htons(port);
      break;
    default:
      return 5;
  }
  return 0;
}
function ___syscall_getsockname(fd, addr, addrlen) {
  try {

    err("__syscall_getsockname " + fd);
    var sock = getSocketFromFD(fd);
    // TODO: sock.saddr should never be undefined, see TODO in websocket_sock_ops.getname
    var errno = writeSockaddr(addr, sock.family, DNS.lookup_name(sock.saddr || '0.0.0.0'), sock.sport, addrlen);
    assert(!errno);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_ioctl(fd, op, varargs) {
  SYSCALLS.varargs = varargs;
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    switch (op) {
      case 21509:
      case 21505: {
        if (!stream.tty) return -59;
        return 0;
      }
      case 21510:
      case 21511:
      case 21512:
      case 21506:
      case 21507:
      case 21508: {
        if (!stream.tty) return -59;
        return 0; // no-op, not actually adjusting terminal settings
      }
      case 21519: {
        if (!stream.tty) return -59;
        var argp = SYSCALLS.get();
        HEAP32[((argp) >> 2)] = 0;
        return 0;
      }
      case 21520: {
        if (!stream.tty) return -59;
        return -28; // not supported
      }
      case 21531: {
        var argp = SYSCALLS.get();
        return FS.ioctl(stream, op, argp);
      }
      case 21523: {
        // TODO: in theory we should write to the winsize struct that gets
        // passed in, but for now musl doesn't read anything on it
        if (!stream.tty) return -59;
        return 0;
      }
      case 21524: {
        // TODO: technically, this ioctl call should change the window size.
        // but, since emscripten doesn't have any concept of a terminal window
        // yet, we'll just silently throw it away as we do TIOCGWINSZ
        if (!stream.tty) return -59;
        return 0;
      }
      default: abort('bad ioctl syscall ' + op);
    }
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_lstat64(path, buf) {
  try {

    path = SYSCALLS.getStr(path);
    return SYSCALLS.doStat(FS.lstat, path, buf);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_mkdir(path, mode) {
  try {

    path = SYSCALLS.getStr(path);
    return SYSCALLS.doMkdir(path, mode);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_open(path, flags, varargs) {
  SYSCALLS.varargs = varargs;
  try {

    var pathname = SYSCALLS.getStr(path);
    var mode = varargs ? SYSCALLS.get() : 0;
    var stream = FS.open(pathname, flags, mode);
    return stream.fd;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_recvfrom(fd, buf, len, flags, addr, addrlen) {
  try {

    var sock = getSocketFromFD(fd);
    var msg = sock.sock_ops.recvmsg(sock, len);
    if (!msg) return 0; // socket is closed
    if (addr) {
      var errno = writeSockaddr(addr, sock.family, DNS.lookup_name(msg.addr), msg.port, addrlen);
      assert(!errno);
    }
    HEAPU8.set(msg.buffer, buf);
    return msg.buffer.byteLength;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_rename(old_path, new_path) {
  try {

    old_path = SYSCALLS.getStr(old_path);
    new_path = SYSCALLS.getStr(new_path);
    FS.rename(old_path, new_path);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_rmdir(path) {
  try {

    path = SYSCALLS.getStr(path);
    FS.rmdir(path);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_sendto(fd, message, length, flags, addr, addr_len) {
  try {

    var sock = getSocketFromFD(fd);
    var dest = getSocketAddress(addr, addr_len, true);
    if (!dest) {
      // send, no address provided
      return FS.write(sock.stream, HEAP8, message, length);
    } else {
      // sendto an address
      return sock.sock_ops.sendmsg(sock, HEAP8, message, length, dest.addr, dest.port);
    }
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_socket(domain, type, protocol) {
  try {

    var sock = SOCKFS.createSocket(domain, type, protocol);
    assert(sock.stream.fd < 64); // XXX ? select() assumes socket fd values are in 0..63
    return sock.stream.fd;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_stat64(path, buf) {
  try {

    path = SYSCALLS.getStr(path);
    return SYSCALLS.doStat(FS.stat, path, buf);
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

function ___syscall_unlink(path) {
  try {

    path = SYSCALLS.getStr(path);
    FS.unlink(path);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}

var _emscripten_get_now; if (ENVIRONMENT_IS_NODE) {
  _emscripten_get_now = () => {
    var t = process['hrtime']();
    return t[0] * 1e3 + t[1] / 1e6;
  };
} else _emscripten_get_now = () => performance.now();
;

var _emscripten_get_now_is_monotonic = true;;
function _clock_gettime(clk_id, tp) {
  // int clock_gettime(clockid_t clk_id, struct timespec *tp);
  var now;
  if (clk_id === 0) {
    now = Date.now();
  } else if ((clk_id === 1 || clk_id === 4) && _emscripten_get_now_is_monotonic) {
    now = _emscripten_get_now();
  } else {
    setErrNo(28);
    return -1;
  }
  HEAP32[((tp) >> 2)] = (now / 1000) | 0; // seconds
  HEAP32[(((tp) + (4)) >> 2)] = ((now % 1000) * 1000 * 1000) | 0; // nanoseconds
  return 0;
}

function _emscripten_set_main_loop_timing(mode, value) {
  Browser.mainLoop.timingMode = mode;
  Browser.mainLoop.timingValue = value;

  if (!Browser.mainLoop.func) {
    err('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
    return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
  }

  if (!Browser.mainLoop.running) {

    Browser.mainLoop.running = true;
  }
  if (mode == 0 /*EM_TIMING_SETTIMEOUT*/) {
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
      var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now()) | 0;
      setTimeout(Browser.mainLoop.runner, timeUntilNextTick); // doing this each time means that on exception, we stop
    };
    Browser.mainLoop.method = 'timeout';
  } else if (mode == 1 /*EM_TIMING_RAF*/) {
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
      Browser.requestAnimationFrame(Browser.mainLoop.runner);
    };
    Browser.mainLoop.method = 'rAF';
  } else if (mode == 2 /*EM_TIMING_SETIMMEDIATE*/) {
    if (typeof setImmediate == 'undefined') {
      // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
      var setImmediates = [];
      var emscriptenMainLoopMessageId = 'setimmediate';
      var Browser_setImmediate_messageHandler = function (/** @type {Event} */ event) {
        // When called in current thread or Worker, the main loop ID is structured slightly different to accommodate for --proxy-to-worker runtime listening to Worker events,
        // so check for both cases.
        if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
          event.stopPropagation();
          setImmediates.shift()();
        }
      }
      addEventListener("message", Browser_setImmediate_messageHandler, true);
      setImmediate = /** @type{function(function(): ?, ...?): number} */(function Browser_emulated_setImmediate(func) {
        setImmediates.push(func);
        if (ENVIRONMENT_IS_WORKER) {
          if (Module['setImmediates'] === undefined) Module['setImmediates'] = [];
          Module['setImmediates'].push(func);
          postMessage({ target: emscriptenMainLoopMessageId }); // In --proxy-to-worker, route the message via proxyClient.js
        } else postMessage(emscriptenMainLoopMessageId, "*"); // On the main thread, can just send the message to itself.
      })
    }
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
      setImmediate(Browser.mainLoop.runner);
    };
    Browser.mainLoop.method = 'immediate';
  }
  return 0;
}

function runtimeKeepalivePush() {
  runtimeKeepaliveCounter += 1;
}

function _exit(status) {
  // void _exit(int status);
  // http://pubs.opengroup.org/onlinepubs/000095399/functions/exit.html
  exit(status);
}
function maybeExit() {
  if (!keepRuntimeAlive()) {
    try {
      _exit(EXITSTATUS);
    } catch (e) {
      handleException(e);
    }
  }
}

/**
 * @param {number=} arg
 * @param {boolean=} noSetTiming
 */
function setMainLoop(browserIterationFunc, fps, simulateInfiniteLoop, arg, noSetTiming) {
  assert(!Browser.mainLoop.func, 'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.');

  Browser.mainLoop.func = browserIterationFunc;
  Browser.mainLoop.arg = arg;

  var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
  function checkIsRunning() {
    if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) {

      maybeExit();
      return false;
    }
    return true;
  }

  // We create the loop runner here but it is not actually running until
  // _emscripten_set_main_loop_timing is called (which might happen a
  // later time).  This member signifies that the current runner has not
  // yet been started so that we can call runtimeKeepalivePush when it
  // gets it timing set for the first time.
  Browser.mainLoop.running = false;
  Browser.mainLoop.runner = function Browser_mainLoop_runner() {
    if (ABORT) return;
    if (Browser.mainLoop.queue.length > 0) {
      var start = Date.now();
      var blocker = Browser.mainLoop.queue.shift();
      blocker.func(blocker.arg);
      if (Browser.mainLoop.remainingBlockers) {
        var remaining = Browser.mainLoop.remainingBlockers;
        var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
        if (blocker.counted) {
          Browser.mainLoop.remainingBlockers = next;
        } else {
          // not counted, but move the progress along a tiny bit
          next = next + 0.5; // do not steal all the next one's progress
          Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
        }
      }
      out('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + ' ms'); //, left: ' + Browser.mainLoop.remainingBlockers);
      Browser.mainLoop.updateStatus();

      // catches pause/resume main loop from blocker execution
      if (!checkIsRunning()) return;

      setTimeout(Browser.mainLoop.runner, 0);
      return;
    }

    // catch pauses from non-main loop sources
    if (!checkIsRunning()) return;

    // Implement very basic swap interval control
    Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
    if (Browser.mainLoop.timingMode == 1/*EM_TIMING_RAF*/ && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
      // Not the scheduled time to render this frame - skip.
      Browser.mainLoop.scheduler();
      return;
    } else if (Browser.mainLoop.timingMode == 0/*EM_TIMING_SETTIMEOUT*/) {
      Browser.mainLoop.tickStartTime = _emscripten_get_now();
    }

    // Signal GL rendering layer that processing of a new frame is about to start. This helps it optimize
    // VBO double-buffering and reduce GPU stalls.

    if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
      warnOnce('Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!');
      Browser.mainLoop.method = ''; // just warn once per call to set main loop
    }

    Browser.mainLoop.runIter(browserIterationFunc);

    checkStackCookie();

    // catch pauses from the main loop itself
    if (!checkIsRunning()) return;

    // Queue new audio data. This is important to be right after the main loop invocation, so that we will immediately be able
    // to queue the newest produced audio samples.
    // TODO: Consider adding pre- and post- rAF callbacks so that GL.newRenderingFrameStarted() and SDL.audio.queueNewAudioData()
    //       do not need to be hardcoded into this function, but can be more generic.
    if (typeof SDL == 'object' && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();

    Browser.mainLoop.scheduler();
  }

  if (!noSetTiming) {
    if (fps && fps > 0) _emscripten_set_main_loop_timing(0/*EM_TIMING_SETTIMEOUT*/, 1000.0 / fps);
    else _emscripten_set_main_loop_timing(1/*EM_TIMING_RAF*/, 1); // Do rAF by rendering each frame (no decimating)

    Browser.mainLoop.scheduler();
  }

  if (simulateInfiniteLoop) {
    throw 'unwind';
  }
}

/** @param {boolean=} synchronous */
function callUserCallback(func, synchronous) {
  if (runtimeExited || ABORT) {
    err('user callback triggered after runtime exited or application aborted.  Ignoring.');
    return;
  }
  // For synchronous calls, let any exceptions propagate, and don't let the runtime exit.
  if (synchronous) {
    func();
    return;
  }
  try {
    func();
  } catch (e) {
    handleException(e);
  }
}

function runtimeKeepalivePop() {
  assert(runtimeKeepaliveCounter > 0);
  runtimeKeepaliveCounter -= 1;
}
/** @param {number=} timeout */
function safeSetTimeout(func, timeout) {

  return setTimeout(function () {

    callUserCallback(func);
  }, timeout);
}
var Browser = {
  mainLoop: {
    running: false, scheduler: null, method: "", currentlyRunningMainloop: 0, func: null, arg: 0, timingMode: 0, timingValue: 0, currentFrameNumber: 0, queue: [], pause: function () {
      Browser.mainLoop.scheduler = null;
      // Incrementing this signals the previous main loop that it's now become old, and it must return.
      Browser.mainLoop.currentlyRunningMainloop++;
    }, resume: function () {
      Browser.mainLoop.currentlyRunningMainloop++;
      var timingMode = Browser.mainLoop.timingMode;
      var timingValue = Browser.mainLoop.timingValue;
      var func = Browser.mainLoop.func;
      Browser.mainLoop.func = null;
      // do not set timing and call scheduler, we will do it on the next lines
      setMainLoop(func, 0, false, Browser.mainLoop.arg, true);
      _emscripten_set_main_loop_timing(timingMode, timingValue);
      Browser.mainLoop.scheduler();
    }, updateStatus: function () {
      if (Module['setStatus']) {
        var message = Module['statusMessage'] || 'Please wait...';
        var remaining = Browser.mainLoop.remainingBlockers;
        var expected = Browser.mainLoop.expectedBlockers;
        if (remaining) {
          if (remaining < expected) {
            Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
          } else {
            Module['setStatus'](message);
          }
        } else {
          Module['setStatus']('');
        }
      }
    }, runIter: function (func) {
      if (ABORT) return;
      if (Module['preMainLoop']) {
        var preRet = Module['preMainLoop']();
        if (preRet === false) {
          return; // |return false| skips a frame
        }
      }
      callUserCallback(func);
      if (Module['postMainLoop']) Module['postMainLoop']();
    }
  }, isFullscreen: false, pointerLock: false, moduleContextCreatedCallbacks: [], workers: [], init: function () {
    if (!Module["preloadPlugins"]) Module["preloadPlugins"] = []; // needs to exist even in workers

    if (Browser.initted) return;
    Browser.initted = true;

    try {
      new Blob();
      Browser.hasBlobConstructor = true;
    } catch (e) {
      Browser.hasBlobConstructor = false;
      out("warning: no blob constructor, cannot create blobs with mimetypes");
    }
    Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : (typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : (!Browser.hasBlobConstructor ? out("warning: no BlobBuilder") : null));
    Browser.URLObject = typeof window != "undefined" ? (window.URL ? window.URL : window.webkitURL) : undefined;
    if (!Module.noImageDecoding && typeof Browser.URLObject == 'undefined') {
      out("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
      Module.noImageDecoding = true;
    }

    // Support for plugins that can process preloaded files. You can add more of these to
    // your app by creating and appending to Module.preloadPlugins.
    //
    // Each plugin is asked if it can handle a file based on the file's name. If it can,
    // it is given the file's raw data. When it is done, it calls a callback with the file's
    // (possibly modified) data. For example, a plugin might decompress a file, or it
    // might create some side data structure for use later (like an Image element, etc.).

    var imagePlugin = {};
    imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
      return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
    };
    imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
      var b = null;
      if (Browser.hasBlobConstructor) {
        try {
          b = new Blob([byteArray], { type: Browser.getMimetype(name) });
          if (b.size !== byteArray.length) { // Safari bug #118630
            // Safari's Blob can only take an ArrayBuffer
            b = new Blob([(new Uint8Array(byteArray)).buffer], { type: Browser.getMimetype(name) });
          }
        } catch (e) {
          warnOnce('Blob constructor present but fails: ' + e + '; falling back to blob builder');
        }
      }
      if (!b) {
        var bb = new Browser.BlobBuilder();
        bb.append((new Uint8Array(byteArray)).buffer); // we need to pass a buffer, and must copy the array to get the right data range
        b = bb.getBlob();
      }
      var url = Browser.URLObject.createObjectURL(b);
      assert(typeof url == 'string', 'createObjectURL must return a url as a string');
      var img = new Image();
      img.onload = () => {
        assert(img.complete, 'Image ' + name + ' could not be decoded');
        var canvas = /** @type {!HTMLCanvasElement} */ (document.createElement('canvas'));
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        Module["preloadedImages"][name] = canvas;
        Browser.URLObject.revokeObjectURL(url);
        if (onload) onload(byteArray);
      };
      img.onerror = (event) => {
        out('Image ' + url + ' could not be decoded');
        if (onerror) onerror();
      };
      img.src = url;
    };
    Module['preloadPlugins'].push(imagePlugin);

    var audioPlugin = {};
    audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
      return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
    };
    audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
      var done = false;
      function finish(audio) {
        if (done) return;
        done = true;
        Module["preloadedAudios"][name] = audio;
        if (onload) onload(byteArray);
      }
      function fail() {
        if (done) return;
        done = true;
        Module["preloadedAudios"][name] = new Audio(); // empty shim
        if (onerror) onerror();
      }
      if (Browser.hasBlobConstructor) {
        try {
          var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
        } catch (e) {
          return fail();
        }
        var url = Browser.URLObject.createObjectURL(b); // XXX we never revoke this!
        assert(typeof url == 'string', 'createObjectURL must return a url as a string');
        var audio = new Audio();
        audio.addEventListener('canplaythrough', function () { finish(audio) }, false); // use addEventListener due to chromium bug 124926
        audio.onerror = function audio_onerror(event) {
          if (done) return;
          out('warning: browser could not fully decode audio ' + name + ', trying slower base64 approach');
          function encode64(data) {
            var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            var PAD = '=';
            var ret = '';
            var leftchar = 0;
            var leftbits = 0;
            for (var i = 0; i < data.length; i++) {
              leftchar = (leftchar << 8) | data[i];
              leftbits += 8;
              while (leftbits >= 6) {
                var curr = (leftchar >> (leftbits - 6)) & 0x3f;
                leftbits -= 6;
                ret += BASE[curr];
              }
            }
            if (leftbits == 2) {
              ret += BASE[(leftchar & 3) << 4];
              ret += PAD + PAD;
            } else if (leftbits == 4) {
              ret += BASE[(leftchar & 0xf) << 2];
              ret += PAD;
            }
            return ret;
          }
          audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
          finish(audio); // we don't wait for confirmation this worked - but it's worth trying
        };
        audio.src = url;
        // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
        safeSetTimeout(function () {
          finish(audio); // try to use it even though it is not necessarily ready to play
        }, 10000);
      } else {
        return fail();
      }
    };
    Module['preloadPlugins'].push(audioPlugin);

    // Canvas event setup

    function pointerLockChange() {
      Browser.pointerLock = document['pointerLockElement'] === Module['canvas'] ||
        document['mozPointerLockElement'] === Module['canvas'] ||
        document['webkitPointerLockElement'] === Module['canvas'] ||
        document['msPointerLockElement'] === Module['canvas'];
    }
    var canvas = Module['canvas'];
    if (canvas) {
      // forced aspect ratio can be enabled by defining 'forcedAspectRatio' on Module
      // Module['forcedAspectRatio'] = 4 / 3;

      canvas.requestPointerLock = canvas['requestPointerLock'] ||
        canvas['mozRequestPointerLock'] ||
        canvas['webkitRequestPointerLock'] ||
        canvas['msRequestPointerLock'] ||
        function () { };
      canvas.exitPointerLock = document['exitPointerLock'] ||
        document['mozExitPointerLock'] ||
        document['webkitExitPointerLock'] ||
        document['msExitPointerLock'] ||
        function () { }; // no-op if function does not exist
      canvas.exitPointerLock = canvas.exitPointerLock.bind(document);

      document.addEventListener('pointerlockchange', pointerLockChange, false);
      document.addEventListener('mozpointerlockchange', pointerLockChange, false);
      document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
      document.addEventListener('mspointerlockchange', pointerLockChange, false);

      if (Module['elementPointerLock']) {
        canvas.addEventListener("click", function (ev) {
          if (!Browser.pointerLock && Module['canvas'].requestPointerLock) {
            Module['canvas'].requestPointerLock();
            ev.preventDefault();
          }
        }, false);
      }
    }
  }, handledByPreloadPlugin: function (byteArray, fullname, finish, onerror) {
    // Ensure plugins are ready.
    Browser.init();

    var handled = false;
    Module['preloadPlugins'].forEach(function (plugin) {
      if (handled) return;
      if (plugin['canHandle'](fullname)) {
        plugin['handle'](byteArray, fullname, finish, onerror);
        handled = true;
      }
    });
    return handled;
  }, createContext: function (/** @type {HTMLCanvasElement} */ canvas, useWebGL, setInModule, webGLContextAttributes) {
    if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx; // no need to recreate GL context if it's already been created for this canvas.

    var ctx;
    var contextHandle;
    if (useWebGL) {
      // For GLES2/desktop GL compatibility, adjust a few defaults to be different to WebGL defaults, so that they align better with the desktop defaults.
      var contextAttributes = {
        antialias: false,
        alpha: false,
        majorVersion: 1,
      };

      if (webGLContextAttributes) {
        for (var attribute in webGLContextAttributes) {
          contextAttributes[attribute] = webGLContextAttributes[attribute];
        }
      }

      // This check of existence of GL is here to satisfy Closure compiler, which yells if variable GL is referenced below but GL object is not
      // actually compiled in because application is not doing any GL operations. TODO: Ideally if GL is not being used, this function
      // Browser.createContext() should not even be emitted.
      if (typeof GL != 'undefined') {
        contextHandle = GL.createContext(canvas, contextAttributes);
        if (contextHandle) {
          ctx = GL.getContext(contextHandle).GLctx;
        }
      }
    } else {
      ctx = canvas.getContext('2d');
    }

    if (!ctx) return null;

    if (setInModule) {
      if (!useWebGL) assert(typeof GLctx == 'undefined', 'cannot set in module if GLctx is used, but we are a non-GL context that would replace it');

      Module.ctx = ctx;
      if (useWebGL) GL.makeContextCurrent(contextHandle);
      Module.useWebGL = useWebGL;
      Browser.moduleContextCreatedCallbacks.forEach(function (callback) { callback() });
      Browser.init();
    }
    return ctx;
  }, destroyContext: function (canvas, useWebGL, setInModule) { }, fullscreenHandlersInstalled: false, lockPointer: undefined, resizeCanvas: undefined, requestFullscreen: function (lockPointer, resizeCanvas) {
    Browser.lockPointer = lockPointer;
    Browser.resizeCanvas = resizeCanvas;
    if (typeof Browser.lockPointer == 'undefined') Browser.lockPointer = true;
    if (typeof Browser.resizeCanvas == 'undefined') Browser.resizeCanvas = false;

    var canvas = Module['canvas'];
    function fullscreenChange() {
      Browser.isFullscreen = false;
      var canvasContainer = canvas.parentNode;
      if ((document['fullscreenElement'] || document['mozFullScreenElement'] ||
        document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
        document['webkitCurrentFullScreenElement']) === canvasContainer) {
        canvas.exitFullscreen = Browser.exitFullscreen;
        if (Browser.lockPointer) canvas.requestPointerLock();
        Browser.isFullscreen = true;
        if (Browser.resizeCanvas) {
          Browser.setFullscreenCanvasSize();
        } else {
          Browser.updateCanvasDimensions(canvas);
        }
      } else {
        // remove the full screen specific parent of the canvas again to restore the HTML structure from before going full screen
        canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
        canvasContainer.parentNode.removeChild(canvasContainer);

        if (Browser.resizeCanvas) {
          Browser.setWindowedCanvasSize();
        } else {
          Browser.updateCanvasDimensions(canvas);
        }
      }
      if (Module['onFullScreen']) Module['onFullScreen'](Browser.isFullscreen);
      if (Module['onFullscreen']) Module['onFullscreen'](Browser.isFullscreen);
    }

    if (!Browser.fullscreenHandlersInstalled) {
      Browser.fullscreenHandlersInstalled = true;
      document.addEventListener('fullscreenchange', fullscreenChange, false);
      document.addEventListener('mozfullscreenchange', fullscreenChange, false);
      document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
      document.addEventListener('MSFullscreenChange', fullscreenChange, false);
    }

    // create a new parent to ensure the canvas has no siblings. this allows browsers to optimize full screen performance when its parent is the full screen root
    var canvasContainer = document.createElement("div");
    canvas.parentNode.insertBefore(canvasContainer, canvas);
    canvasContainer.appendChild(canvas);

    // use parent of canvas as full screen root to allow aspect ratio correction (Firefox stretches the root to screen size)
    canvasContainer.requestFullscreen = canvasContainer['requestFullscreen'] ||
      canvasContainer['mozRequestFullScreen'] ||
      canvasContainer['msRequestFullscreen'] ||
      (canvasContainer['webkitRequestFullscreen'] ? function () { canvasContainer['webkitRequestFullscreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null) ||
      (canvasContainer['webkitRequestFullScreen'] ? function () { canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null);

    canvasContainer.requestFullscreen();
  }, requestFullScreen: function () {
    abort('Module.requestFullScreen has been replaced by Module.requestFullscreen (without a capital S)');
  }, exitFullscreen: function () {
    // This is workaround for chrome. Trying to exit from fullscreen
    // not in fullscreen state will cause "TypeError: Document not active"
    // in chrome. See https://github.com/emscripten-core/emscripten/pull/8236
    if (!Browser.isFullscreen) {
      return false;
    }

    var CFS = document['exitFullscreen'] ||
      document['cancelFullScreen'] ||
      document['mozCancelFullScreen'] ||
      document['msExitFullscreen'] ||
      document['webkitCancelFullScreen'] ||
      (function () { });
    CFS.apply(document, []);
    return true;
  }, nextRAF: 0, fakeRequestAnimationFrame: function (func) {
    // try to keep 60fps between calls to here
    var now = Date.now();
    if (Browser.nextRAF === 0) {
      Browser.nextRAF = now + 1000 / 60;
    } else {
      while (now + 2 >= Browser.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
        Browser.nextRAF += 1000 / 60;
      }
    }
    var delay = Math.max(Browser.nextRAF - now, 0);
    setTimeout(func, delay);
  }, requestAnimationFrame: function (func) {
    if (typeof requestAnimationFrame == 'function') {
      requestAnimationFrame(func);
      return;
    }
    var RAF = Browser.fakeRequestAnimationFrame;
    RAF(func);
  }, safeSetTimeout: function (func) {
    // Legacy function, this is used by the SDL2 port so we need to keep it
    // around at least until that is updated.
    return safeSetTimeout(func);
  }, safeRequestAnimationFrame: function (func) {

    return Browser.requestAnimationFrame(function () {

      callUserCallback(func);
    });
  }, getMimetype: function (name) {
    return {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'bmp': 'image/bmp',
      'ogg': 'audio/ogg',
      'wav': 'audio/wav',
      'mp3': 'audio/mpeg'
    }[name.substr(name.lastIndexOf('.') + 1)];
  }, getUserMedia: function (func) {
    if (!window.getUserMedia) {
      window.getUserMedia = navigator['getUserMedia'] ||
        navigator['mozGetUserMedia'];
    }
    window.getUserMedia(func);
  }, getMovementX: function (event) {
    return event['movementX'] ||
      event['mozMovementX'] ||
      event['webkitMovementX'] ||
      0;
  }, getMovementY: function (event) {
    return event['movementY'] ||
      event['mozMovementY'] ||
      event['webkitMovementY'] ||
      0;
  }, getMouseWheelDelta: function (event) {
    var delta = 0;
    switch (event.type) {
      case 'DOMMouseScroll':
        // 3 lines make up a step
        delta = event.detail / 3;
        break;
      case 'mousewheel':
        // 120 units make up a step
        delta = event.wheelDelta / 120;
        break;
      case 'wheel':
        delta = event.deltaY
        switch (event.deltaMode) {
          case 0:
            // DOM_DELTA_PIXEL: 100 pixels make up a step
            delta /= 100;
            break;
          case 1:
            // DOM_DELTA_LINE: 3 lines make up a step
            delta /= 3;
            break;
          case 2:
            // DOM_DELTA_PAGE: A page makes up 80 steps
            delta *= 80;
            break;
          default:
            throw 'unrecognized mouse wheel delta mode: ' + event.deltaMode;
        }
        break;
      default:
        throw 'unrecognized mouse wheel event: ' + event.type;
    }
    return delta;
  }, mouseX: 0, mouseY: 0, mouseMovementX: 0, mouseMovementY: 0, touches: {}, lastTouches: {}, calculateMouseEvent: function (event) { // event should be mousemove, mousedown or mouseup
    if (Browser.pointerLock) {
      // When the pointer is locked, calculate the coordinates
      // based on the movement of the mouse.
      // Workaround for Firefox bug 764498
      if (event.type != 'mousemove' &&
        ('mozMovementX' in event)) {
        Browser.mouseMovementX = Browser.mouseMovementY = 0;
      } else {
        Browser.mouseMovementX = Browser.getMovementX(event);
        Browser.mouseMovementY = Browser.getMovementY(event);
      }

      // check if SDL is available
      if (typeof SDL != "undefined") {
        Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
        Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
      } else {
        // just add the mouse delta to the current absolut mouse position
        // FIXME: ideally this should be clamped against the canvas size and zero
        Browser.mouseX += Browser.mouseMovementX;
        Browser.mouseY += Browser.mouseMovementY;
      }
    } else {
      // Otherwise, calculate the movement based on the changes
      // in the coordinates.
      var rect = Module["canvas"].getBoundingClientRect();
      var cw = Module["canvas"].width;
      var ch = Module["canvas"].height;

      // Neither .scrollX or .pageXOffset are defined in a spec, but
      // we prefer .scrollX because it is currently in a spec draft.
      // (see: http://www.w3.org/TR/2013/WD-cssom-view-20131217/)
      var scrollX = ((typeof window.scrollX != 'undefined') ? window.scrollX : window.pageXOffset);
      var scrollY = ((typeof window.scrollY != 'undefined') ? window.scrollY : window.pageYOffset);
      // If this assert lands, it's likely because the browser doesn't support scrollX or pageXOffset
      // and we have no viable fallback.
      assert((typeof scrollX != 'undefined') && (typeof scrollY != 'undefined'), 'Unable to retrieve scroll position, mouse positions likely broken.');

      if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
        var touch = event.touch;
        if (touch === undefined) {
          return; // the "touch" property is only defined in SDL

        }
        var adjustedX = touch.pageX - (scrollX + rect.left);
        var adjustedY = touch.pageY - (scrollY + rect.top);

        adjustedX = adjustedX * (cw / rect.width);
        adjustedY = adjustedY * (ch / rect.height);

        var coords = { x: adjustedX, y: adjustedY };

        if (event.type === 'touchstart') {
          Browser.lastTouches[touch.identifier] = coords;
          Browser.touches[touch.identifier] = coords;
        } else if (event.type === 'touchend' || event.type === 'touchmove') {
          var last = Browser.touches[touch.identifier];
          if (!last) last = coords;
          Browser.lastTouches[touch.identifier] = last;
          Browser.touches[touch.identifier] = coords;
        }
        return;
      }

      var x = event.pageX - (scrollX + rect.left);
      var y = event.pageY - (scrollY + rect.top);

      // the canvas might be CSS-scaled compared to its backbuffer;
      // SDL-using content will want mouse coordinates in terms
      // of backbuffer units.
      x = x * (cw / rect.width);
      y = y * (ch / rect.height);

      Browser.mouseMovementX = x - Browser.mouseX;
      Browser.mouseMovementY = y - Browser.mouseY;
      Browser.mouseX = x;
      Browser.mouseY = y;
    }
  }, resizeListeners: [], updateResizeListeners: function () {
    var canvas = Module['canvas'];
    Browser.resizeListeners.forEach(function (listener) {
      listener(canvas.width, canvas.height);
    });
  }, setCanvasSize: function (width, height, noUpdates) {
    var canvas = Module['canvas'];
    Browser.updateCanvasDimensions(canvas, width, height);
    if (!noUpdates) Browser.updateResizeListeners();
  }, windowedWidth: 0, windowedHeight: 0, setFullscreenCanvasSize: function () {
    // check if SDL is available
    if (typeof SDL != "undefined") {
      var flags = HEAPU32[((SDL.screen) >> 2)];
      flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
      HEAP32[((SDL.screen) >> 2)] = flags;
    }
    Browser.updateCanvasDimensions(Module['canvas']);
    Browser.updateResizeListeners();
  }, setWindowedCanvasSize: function () {
    // check if SDL is available
    if (typeof SDL != "undefined") {
      var flags = HEAPU32[((SDL.screen) >> 2)];
      flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
      HEAP32[((SDL.screen) >> 2)] = flags;
    }
    Browser.updateCanvasDimensions(Module['canvas']);
    Browser.updateResizeListeners();
  }, updateCanvasDimensions: function (canvas, wNative, hNative) {
    if (wNative && hNative) {
      canvas.widthNative = wNative;
      canvas.heightNative = hNative;
    } else {
      wNative = canvas.widthNative;
      hNative = canvas.heightNative;
    }
    var w = wNative;
    var h = hNative;
    if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
      if (w / h < Module['forcedAspectRatio']) {
        w = Math.round(h * Module['forcedAspectRatio']);
      } else {
        h = Math.round(w / Module['forcedAspectRatio']);
      }
    }
    if (((document['fullscreenElement'] || document['mozFullScreenElement'] ||
      document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
      document['webkitCurrentFullScreenElement']) === canvas.parentNode) && (typeof screen != 'undefined')) {
      var factor = Math.min(screen.width / w, screen.height / h);
      w = Math.round(w * factor);
      h = Math.round(h * factor);
    }
    if (Browser.resizeCanvas) {
      if (canvas.width != w) canvas.width = w;
      if (canvas.height != h) canvas.height = h;
      if (typeof canvas.style != 'undefined') {
        canvas.style.removeProperty("width");
        canvas.style.removeProperty("height");
      }
    } else {
      if (canvas.width != wNative) canvas.width = wNative;
      if (canvas.height != hNative) canvas.height = hNative;
      if (typeof canvas.style != 'undefined') {
        if (w != wNative || h != hNative) {
          canvas.style.setProperty("width", w + "px", "important");
          canvas.style.setProperty("height", h + "px", "important");
        } else {
          canvas.style.removeProperty("width");
          canvas.style.removeProperty("height");
        }
      }
    }
  }
};
var EGL = {
  errorCode: 12288, defaultDisplayInitialized: false, currentContext: 0, currentReadSurface: 0, currentDrawSurface: 0, contextAttributes: { alpha: false, depth: false, stencil: false, antialias: false }, stringCache: {}, setErrorCode: function (code) {
    EGL.errorCode = code;
  }, chooseConfig: function (display, attribList, config, config_size, numConfigs) {
    if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
      EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
      return 0;
    }

    if (attribList) {
      // read attribList if it is non-null
      for (; ;) {
        var param = HEAP32[((attribList) >> 2)];
        if (param == 0x3021 /*EGL_ALPHA_SIZE*/) {
          var alphaSize = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.alpha = (alphaSize > 0);
        } else if (param == 0x3025 /*EGL_DEPTH_SIZE*/) {
          var depthSize = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.depth = (depthSize > 0);
        } else if (param == 0x3026 /*EGL_STENCIL_SIZE*/) {
          var stencilSize = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.stencil = (stencilSize > 0);
        } else if (param == 0x3031 /*EGL_SAMPLES*/) {
          var samples = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.antialias = (samples > 0);
        } else if (param == 0x3032 /*EGL_SAMPLE_BUFFERS*/) {
          var samples = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.antialias = (samples == 1);
        } else if (param == 0x3100 /*EGL_CONTEXT_PRIORITY_LEVEL_IMG*/) {
          var requestedPriority = HEAP32[(((attribList) + (4)) >> 2)];
          EGL.contextAttributes.lowLatency = (requestedPriority != 0x3103 /*EGL_CONTEXT_PRIORITY_LOW_IMG*/);
        } else if (param == 0x3038 /*EGL_NONE*/) {
          break;
        }
        attribList += 8;
      }
    }

    if ((!config || !config_size) && !numConfigs) {
      EGL.setErrorCode(0x300C /* EGL_BAD_PARAMETER */);
      return 0;
    }
    if (numConfigs) {
      HEAP32[((numConfigs) >> 2)] = 1; // Total number of supported configs: 1.
    }
    if (config && config_size > 0) {
      HEAP32[((config) >> 2)] = 62002;
    }

    EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
    return 1;
  }
};
function _eglBindAPI(api) {
  if (api == 0x30A0 /* EGL_OPENGL_ES_API */) {
    EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
    return 1;
  } else { // if (api == 0x30A1 /* EGL_OPENVG_API */ || api == 0x30A2 /* EGL_OPENGL_API */) {
    EGL.setErrorCode(0x300C /* EGL_BAD_PARAMETER */);
    return 0;
  }
}

function _eglChooseConfig(display, attrib_list, configs, config_size, numConfigs) {
  return EGL.chooseConfig(display, attrib_list, configs, config_size, numConfigs);
}

function __webgl_enable_ANGLE_instanced_arrays(ctx) {
  // Extension available in WebGL 1 from Firefox 26 and Google Chrome 30 onwards. Core feature in WebGL 2.
  var ext = ctx.getExtension('ANGLE_instanced_arrays');
  if (ext) {
    ctx['vertexAttribDivisor'] = function (index, divisor) { ext['vertexAttribDivisorANGLE'](index, divisor); };
    ctx['drawArraysInstanced'] = function (mode, first, count, primcount) { ext['drawArraysInstancedANGLE'](mode, first, count, primcount); };
    ctx['drawElementsInstanced'] = function (mode, count, type, indices, primcount) { ext['drawElementsInstancedANGLE'](mode, count, type, indices, primcount); };
    return 1;
  }
}

function __webgl_enable_OES_vertex_array_object(ctx) {
  // Extension available in WebGL 1 from Firefox 25 and WebKit 536.28/desktop Safari 6.0.3 onwards. Core feature in WebGL 2.
  var ext = ctx.getExtension('OES_vertex_array_object');
  if (ext) {
    ctx['createVertexArray'] = function () { return ext['createVertexArrayOES'](); };
    ctx['deleteVertexArray'] = function (vao) { ext['deleteVertexArrayOES'](vao); };
    ctx['bindVertexArray'] = function (vao) { ext['bindVertexArrayOES'](vao); };
    ctx['isVertexArray'] = function (vao) { return ext['isVertexArrayOES'](vao); };
    return 1;
  }
}

function __webgl_enable_WEBGL_draw_buffers(ctx) {
  // Extension available in WebGL 1 from Firefox 28 onwards. Core feature in WebGL 2.
  var ext = ctx.getExtension('WEBGL_draw_buffers');
  if (ext) {
    ctx['drawBuffers'] = function (n, bufs) { ext['drawBuffersWEBGL'](n, bufs); };
    return 1;
  }
}

function __webgl_enable_WEBGL_multi_draw(ctx) {
  // Closure is expected to be allowed to minify the '.multiDrawWebgl' property, so not accessing it quoted.
  return !!(ctx.multiDrawWebgl = ctx.getExtension('WEBGL_multi_draw'));
}
var GL = {
  counter: 1, buffers: [], programs: [], framebuffers: [], renderbuffers: [], textures: [], shaders: [], vaos: [], contexts: [], offscreenCanvases: {}, queries: [], stringCache: {}, unpackAlignment: 4, recordError: function recordError(errorCode) {
    if (!GL.lastError) {
      GL.lastError = errorCode;
    }
  }, getNewId: function (table) {
    var ret = GL.counter++;
    for (var i = table.length; i < ret; i++) {
      table[i] = null;
    }
    return ret;
  }, getSource: function (shader, count, string, length) {
    var source = '';
    for (var i = 0; i < count; ++i) {
      var len = length ? HEAP32[(((length) + (i * 4)) >> 2)] : -1;
      source += UTF8ToString(HEAP32[(((string) + (i * 4)) >> 2)], len < 0 ? undefined : len);
    }
    return source;
  }, createContext: function (/** @type {HTMLCanvasElement} */ canvas, webGLContextAttributes) {

    // BUG: Workaround Safari WebGL issue: After successfully acquiring WebGL context on a canvas,
    // calling .getContext() will always return that context independent of which 'webgl' or 'webgl2'
    // context version was passed. See https://bugs.webkit.org/show_bug.cgi?id=222758 and
    // https://github.com/emscripten-core/emscripten/issues/13295.
    // TODO: Once the bug is fixed and shipped in Safari, adjust the Safari version field in above check.
    if (!canvas.getContextSafariWebGL2Fixed) {
      canvas.getContextSafariWebGL2Fixed = canvas.getContext;
      /** @type {function(this:HTMLCanvasElement, string, (Object|null)=): (Object|null)} */
      function fixedGetContext(ver, attrs) {
        var gl = canvas.getContextSafariWebGL2Fixed(ver, attrs);
        return ((ver == 'webgl') == (gl instanceof WebGLRenderingContext)) ? gl : null;
      }
      canvas.getContext = fixedGetContext;
    }

    var ctx =
      (canvas.getContext("webgl", webGLContextAttributes)
        // https://caniuse.com/#feat=webgl
      );

    if (!ctx) return 0;

    var handle = GL.registerContext(ctx, webGLContextAttributes);

    return handle;
  }, registerContext: function (ctx, webGLContextAttributes) {
    // without pthreads a context is just an integer ID
    var handle = GL.getNewId(GL.contexts);

    var context = {
      handle: handle,
      attributes: webGLContextAttributes,
      version: webGLContextAttributes.majorVersion,
      GLctx: ctx
    };

    // Store the created context object so that we can access the context given a canvas without having to pass the parameters again.
    if (ctx.canvas) ctx.canvas.GLctxObject = context;
    GL.contexts[handle] = context;
    if (typeof webGLContextAttributes.enableExtensionsByDefault == 'undefined' || webGLContextAttributes.enableExtensionsByDefault) {
      GL.initExtensions(context);
    }

    return handle;
  }, makeContextCurrent: function (contextHandle) {

    GL.currentContext = GL.contexts[contextHandle]; // Active Emscripten GL layer context object.
    Module.ctx = GLctx = GL.currentContext && GL.currentContext.GLctx; // Active WebGL context object.
    return !(contextHandle && !GLctx);
  }, getContext: function (contextHandle) {
    return GL.contexts[contextHandle];
  }, deleteContext: function (contextHandle) {
    if (GL.currentContext === GL.contexts[contextHandle]) GL.currentContext = null;
    if (typeof JSEvents == 'object') JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas); // Release all JS event handlers on the DOM element that the GL context is associated with since the context is now deleted.
    if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas) GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined; // Make sure the canvas object no longer refers to the context object so there are no GC surprises.
    GL.contexts[contextHandle] = null;
  }, initExtensions: function (context) {
    // If this function is called without a specific context object, init the extensions of the currently active context.
    if (!context) context = GL.currentContext;

    if (context.initExtensionsDone) return;
    context.initExtensionsDone = true;

    var GLctx = context.GLctx;

    // Detect the presence of a few extensions manually, this GL interop layer itself will need to know if they exist.

    // Extensions that are only available in WebGL 1 (the calls will be no-ops if called on a WebGL 2 context active)
    __webgl_enable_ANGLE_instanced_arrays(GLctx);
    __webgl_enable_OES_vertex_array_object(GLctx);
    __webgl_enable_WEBGL_draw_buffers(GLctx);

    {
      GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query");
    }

    __webgl_enable_WEBGL_multi_draw(GLctx);

    // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
    var exts = GLctx.getSupportedExtensions() || [];
    exts.forEach(function (ext) {
      // WEBGL_lose_context, WEBGL_debug_renderer_info and WEBGL_debug_shaders are not enabled by default.
      if (!ext.includes('lose_context') && !ext.includes('debug')) {
        // Call .getExtension() to enable that extension permanently.
        GLctx.getExtension(ext);
      }
    });
  }
};
function _eglCreateContext(display, config, hmm, contextAttribs) {
  if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }

  // EGL 1.4 spec says default EGL_CONTEXT_CLIENT_VERSION is GLES1, but this is not supported by Emscripten.
  // So user must pass EGL_CONTEXT_CLIENT_VERSION == 2 to initialize EGL.
  var glesContextVersion = 1;
  for (; ;) {
    var param = HEAP32[((contextAttribs) >> 2)];
    if (param == 0x3098 /*EGL_CONTEXT_CLIENT_VERSION*/) {
      glesContextVersion = HEAP32[(((contextAttribs) + (4)) >> 2)];
    } else if (param == 0x3038 /*EGL_NONE*/) {
      break;
    } else {
      /* EGL1.4 specifies only EGL_CONTEXT_CLIENT_VERSION as supported attribute */
      EGL.setErrorCode(0x3004 /*EGL_BAD_ATTRIBUTE*/);
      return 0;
    }
    contextAttribs += 8;
  }
  if (glesContextVersion != 2) {
    EGL.setErrorCode(0x3005 /* EGL_BAD_CONFIG */);
    return 0; /* EGL_NO_CONTEXT */
  }

  EGL.contextAttributes.majorVersion = glesContextVersion - 1; // WebGL 1 is GLES 2, WebGL2 is GLES3
  EGL.contextAttributes.minorVersion = 0;

  EGL.context = GL.createContext(Module['canvas'], EGL.contextAttributes);

  if (EGL.context != 0) {
    EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);

    // Run callbacks so that GL emulation works
    GL.makeContextCurrent(EGL.context);
    Module.useWebGL = true;
    Browser.moduleContextCreatedCallbacks.forEach(function (callback) { callback() });

    // Note: This function only creates a context, but it shall not make it active.
    GL.makeContextCurrent(null);
    return 62004; // Magic ID for Emscripten EGLContext
  } else {
    EGL.setErrorCode(0x3009 /* EGL_BAD_MATCH */); // By the EGL 1.4 spec, an implementation that does not support GLES2 (WebGL in this case), this error code is set.
    return 0; /* EGL_NO_CONTEXT */
  }
}

function _eglCreateWindowSurface(display, config, win, attrib_list) {
  if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (config != 62002 /* Magic ID for the only EGLConfig supported by Emscripten */) {
    EGL.setErrorCode(0x3005 /* EGL_BAD_CONFIG */);
    return 0;
  }
  // TODO: Examine attrib_list! Parameters that can be present there are:
  // - EGL_RENDER_BUFFER (must be EGL_BACK_BUFFER)
  // - EGL_VG_COLORSPACE (can't be set)
  // - EGL_VG_ALPHA_FORMAT (can't be set)
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 62006; /* Magic ID for Emscripten 'default surface' */
}

function _eglDestroyContext(display, context) {
  if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (context != 62004 /* Magic ID for Emscripten EGLContext */) {
    EGL.setErrorCode(0x3006 /* EGL_BAD_CONTEXT */);
    return 0;
  }

  GL.deleteContext(EGL.context);
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  if (EGL.currentContext == context) {
    EGL.currentContext = 0;
  }
  return 1 /* EGL_TRUE */;
}

function _eglDestroySurface(display, surface) {
  if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (surface != 62006 /* Magic ID for the only EGLSurface supported by Emscripten */) {
    EGL.setErrorCode(0x300D /* EGL_BAD_SURFACE */);
    return 1;
  }
  if (EGL.currentReadSurface == surface) {
    EGL.currentReadSurface = 0;
  }
  if (EGL.currentDrawSurface == surface) {
    EGL.currentDrawSurface = 0;
  }
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1; /* Magic ID for Emscripten 'default surface' */
}

function _eglGetConfigAttrib(display, config, attribute, value) {
  if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (config != 62002 /* Magic ID for the only EGLConfig supported by Emscripten */) {
    EGL.setErrorCode(0x3005 /* EGL_BAD_CONFIG */);
    return 0;
  }
  if (!value) {
    EGL.setErrorCode(0x300C /* EGL_BAD_PARAMETER */);
    return 0;
  }
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  switch (attribute) {
    case 0x3020: // EGL_BUFFER_SIZE
      HEAP32[((value) >> 2)] = EGL.contextAttributes.alpha ? 32 : 24;
      return 1;
    case 0x3021: // EGL_ALPHA_SIZE
      HEAP32[((value) >> 2)] = EGL.contextAttributes.alpha ? 8 : 0;
      return 1;
    case 0x3022: // EGL_BLUE_SIZE
      HEAP32[((value) >> 2)] = 8;
      return 1;
    case 0x3023: // EGL_GREEN_SIZE
      HEAP32[((value) >> 2)] = 8;
      return 1;
    case 0x3024: // EGL_RED_SIZE
      HEAP32[((value) >> 2)] = 8;
      return 1;
    case 0x3025: // EGL_DEPTH_SIZE
      HEAP32[((value) >> 2)] = EGL.contextAttributes.depth ? 24 : 0;
      return 1;
    case 0x3026: // EGL_STENCIL_SIZE
      HEAP32[((value) >> 2)] = EGL.contextAttributes.stencil ? 8 : 0;
      return 1;
    case 0x3027: // EGL_CONFIG_CAVEAT
      // We can return here one of EGL_NONE (0x3038), EGL_SLOW_CONFIG (0x3050) or EGL_NON_CONFORMANT_CONFIG (0x3051).
      HEAP32[((value) >> 2)] = 0x3038;
      return 1;
    case 0x3028: // EGL_CONFIG_ID
      HEAP32[((value) >> 2)] = 62002;
      return 1;
    case 0x3029: // EGL_LEVEL
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x302A: // EGL_MAX_PBUFFER_HEIGHT
      HEAP32[((value) >> 2)] = 4096;
      return 1;
    case 0x302B: // EGL_MAX_PBUFFER_PIXELS
      HEAP32[((value) >> 2)] = 16777216;
      return 1;
    case 0x302C: // EGL_MAX_PBUFFER_WIDTH
      HEAP32[((value) >> 2)] = 4096;
      return 1;
    case 0x302D: // EGL_NATIVE_RENDERABLE
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x302E: // EGL_NATIVE_VISUAL_ID
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x302F: // EGL_NATIVE_VISUAL_TYPE
      HEAP32[((value) >> 2)] = 0x3038;
      return 1;
    case 0x3031: // EGL_SAMPLES
      HEAP32[((value) >> 2)] = EGL.contextAttributes.antialias ? 4 : 0;
      return 1;
    case 0x3032: // EGL_SAMPLE_BUFFERS
      HEAP32[((value) >> 2)] = EGL.contextAttributes.antialias ? 1 : 0;
      return 1;
    case 0x3033: // EGL_SURFACE_TYPE
      HEAP32[((value) >> 2)] = 0x4;
      return 1;
    case 0x3034: // EGL_TRANSPARENT_TYPE
      // If this returns EGL_TRANSPARENT_RGB (0x3052), transparency is used through color-keying. No such thing applies to Emscripten canvas.
      HEAP32[((value) >> 2)] = 0x3038;
      return 1;
    case 0x3035: // EGL_TRANSPARENT_BLUE_VALUE
    case 0x3036: // EGL_TRANSPARENT_GREEN_VALUE
    case 0x3037: // EGL_TRANSPARENT_RED_VALUE
      // "If EGL_TRANSPARENT_TYPE is EGL_NONE, then the values for EGL_TRANSPARENT_RED_VALUE, EGL_TRANSPARENT_GREEN_VALUE, and EGL_TRANSPARENT_BLUE_VALUE are undefined."
      HEAP32[((value) >> 2)] = -1;
      return 1;
    case 0x3039: // EGL_BIND_TO_TEXTURE_RGB
    case 0x303A: // EGL_BIND_TO_TEXTURE_RGBA
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x303B: // EGL_MIN_SWAP_INTERVAL
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x303C: // EGL_MAX_SWAP_INTERVAL
      HEAP32[((value) >> 2)] = 1;
      return 1;
    case 0x303D: // EGL_LUMINANCE_SIZE
    case 0x303E: // EGL_ALPHA_MASK_SIZE
      HEAP32[((value) >> 2)] = 0;
      return 1;
    case 0x303F: // EGL_COLOR_BUFFER_TYPE
      // EGL has two types of buffers: EGL_RGB_BUFFER and EGL_LUMINANCE_BUFFER.
      HEAP32[((value) >> 2)] = 0x308E;
      return 1;
    case 0x3040: // EGL_RENDERABLE_TYPE
      // A bit combination of EGL_OPENGL_ES_BIT,EGL_OPENVG_BIT,EGL_OPENGL_ES2_BIT and EGL_OPENGL_BIT.
      HEAP32[((value) >> 2)] = 0x4;
      return 1;
    case 0x3042: // EGL_CONFORMANT
      // "EGL_CONFORMANT is a mask indicating if a client API context created with respect to the corresponding EGLConfig will pass the required conformance tests for that API."
      HEAP32[((value) >> 2)] = 0;
      return 1;
    default:
      EGL.setErrorCode(0x3004 /* EGL_BAD_ATTRIBUTE */);
      return 0;
  }
}

function _eglGetDisplay(nativeDisplayType) {
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  // Note: As a 'conformant' implementation of EGL, we would prefer to init here only if the user
  //       calls this function with EGL_DEFAULT_DISPLAY. Other display IDs would be preferred to be unsupported
  //       and EGL_NO_DISPLAY returned. Uncomment the following code lines to do this.
  // Instead, an alternative route has been preferred, namely that the Emscripten EGL implementation
  // "emulates" X11, and eglGetDisplay is expected to accept/receive a pointer to an X11 Display object.
  // Therefore, be lax and allow anything to be passed in, and return the magic handle to our default EGLDisplay object.

  //    if (nativeDisplayType == 0 /* EGL_DEFAULT_DISPLAY */) {
  return 62000; // Magic ID for Emscripten 'default display'
  //    }
  //    else
  //      return 0; // EGL_NO_DISPLAY
}

function _eglGetError() {
  return EGL.errorCode;
}

function _eglInitialize(display, majorVersion, minorVersion) {
  if (display == 62000 /* Magic ID for Emscripten 'default display' */) {
    if (majorVersion) {
      HEAP32[((majorVersion) >> 2)] = 1; // Advertise EGL Major version: '1'
    }
    if (minorVersion) {
      HEAP32[((minorVersion) >> 2)] = 4; // Advertise EGL Minor version: '4'
    }
    EGL.defaultDisplayInitialized = true;
    EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
    return 1;
  }
  else {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
}

function _eglMakeCurrent(display, draw, read, context) {
  if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0 /* EGL_FALSE */;
  }
  //\todo An EGL_NOT_INITIALIZED error is generated if EGL is not initialized for dpy.
  if (context != 0 && context != 62004 /* Magic ID for Emscripten EGLContext */) {
    EGL.setErrorCode(0x3006 /* EGL_BAD_CONTEXT */);
    return 0;
  }
  if ((read != 0 && read != 62006) || (draw != 0 && draw != 62006 /* Magic ID for Emscripten 'default surface' */)) {
    EGL.setErrorCode(0x300D /* EGL_BAD_SURFACE */);
    return 0;
  }

  GL.makeContextCurrent(context ? EGL.context : null);

  EGL.currentContext = context;
  EGL.currentDrawSurface = draw;
  EGL.currentReadSurface = read;
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1 /* EGL_TRUE */;
}

function _eglQueryString(display, name) {
  if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  //\todo An EGL_NOT_INITIALIZED error is generated if EGL is not initialized for dpy.
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  if (EGL.stringCache[name]) return EGL.stringCache[name];
  var ret;
  switch (name) {
    case 0x3053 /* EGL_VENDOR */: ret = allocateUTF8("Emscripten"); break;
    case 0x3054 /* EGL_VERSION */: ret = allocateUTF8("1.4 Emscripten EGL"); break;
    case 0x3055 /* EGL_EXTENSIONS */: ret = allocateUTF8(""); break; // Currently not supporting any EGL extensions.
    case 0x308D /* EGL_CLIENT_APIS */: ret = allocateUTF8("OpenGL_ES"); break;
    default:
      EGL.setErrorCode(0x300C /* EGL_BAD_PARAMETER */);
      return 0;
  }
  EGL.stringCache[name] = ret;
  return ret;
}

function _eglSwapBuffers() {

  if (!EGL.defaultDisplayInitialized) {
    EGL.setErrorCode(0x3001 /* EGL_NOT_INITIALIZED */);
  } else if (!Module.ctx) {
    EGL.setErrorCode(0x3002 /* EGL_BAD_ACCESS */);
  } else if (Module.ctx.isContextLost()) {
    EGL.setErrorCode(0x300E /* EGL_CONTEXT_LOST */);
  } else {
    // According to documentation this does an implicit flush.
    // Due to discussion at https://github.com/emscripten-core/emscripten/pull/1871
    // the flush was removed since this _may_ result in slowing code down.
    //_glFlush();
    EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
    return 1 /* EGL_TRUE */;
  }
  return 0 /* EGL_FALSE */;
}

function _eglSwapInterval(display, interval) {
  if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  if (interval == 0) _emscripten_set_main_loop_timing(0/*EM_TIMING_SETTIMEOUT*/, 0);
  else _emscripten_set_main_loop_timing(1/*EM_TIMING_RAF*/, interval);

  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1;
}

function _eglTerminate(display) {
  if (display != 62000 /* Magic ID for Emscripten 'default display' */) {
    EGL.setErrorCode(0x3008 /* EGL_BAD_DISPLAY */);
    return 0;
  }
  EGL.currentContext = 0;
  EGL.currentReadSurface = 0;
  EGL.currentDrawSurface = 0;
  EGL.defaultDisplayInitialized = false;
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1;
}

function _eglWaitClient() {
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1;
}
function _eglWaitGL(
) {
  return _eglWaitClient();
}

function _eglWaitNative(nativeEngineId) {
  EGL.setErrorCode(0x3000 /* EGL_SUCCESS */);
  return 1;
}

var readAsmConstArgsArray = [];
function readAsmConstArgs(sigPtr, buf) {
  ;
  // Nobody should have mutated _readAsmConstArgsArray underneath us to be something else than an array.
  assert(Array.isArray(readAsmConstArgsArray));
  // The input buffer is allocated on the stack, so it must be stack-aligned.
  assert(buf % 16 == 0);
  readAsmConstArgsArray.length = 0;
  var ch;
  // Most arguments are i32s, so shift the buffer pointer so it is a plain
  // index into HEAP32.
  buf >>= 2;
  while (ch = HEAPU8[sigPtr++]) {
    assert(ch === 100/*'d'*/ || ch === 102/*'f'*/ || ch === 105 /*'i'*/, 'Invalid character ' + ch + '("' + String.fromCharCode(ch) + '") in readAsmConstArgs! Use only "d", "f" or "i", and do not specify "v" for void return argument.');
    // A double takes two 32-bit slots, and must also be aligned - the backend
    // will emit padding to avoid that.
    var readAsmConstArgsDouble = ch < 105;
    if (readAsmConstArgsDouble && (buf & 1)) buf++;
    readAsmConstArgsArray.push(readAsmConstArgsDouble ? HEAPF64[buf++ >> 1] : HEAP32[buf]);
    ++buf;
  }
  return readAsmConstArgsArray;
}
function _emscripten_asm_const_int(code, sigPtr, argbuf) {
  var args = readAsmConstArgs(sigPtr, argbuf);
  if (!ASM_CONSTS.hasOwnProperty(code)) abort('No EM_ASM constant found at address ' + code);
  return ASM_CONSTS[code].apply(null, args);
}

function _emscripten_console_error(str) {
  assert(typeof str == 'number');
  console.error(UTF8ToString(str));
}

var JSEvents = {
  inEventHandler: 0, removeAllEventListeners: function () {
    for (var i = JSEvents.eventHandlers.length - 1; i >= 0; --i) {
      JSEvents._removeHandler(i);
    }
    JSEvents.eventHandlers = [];
    JSEvents.deferredCalls = [];
  }, registerRemoveEventListeners: function () {
    if (!JSEvents.removeEventListenersRegistered) {
      __ATEXIT__.push(JSEvents.removeAllEventListeners);
      JSEvents.removeEventListenersRegistered = true;
    }
  }, deferredCalls: [], deferCall: function (targetFunction, precedence, argsList) {
    function arraysHaveEqualContent(arrA, arrB) {
      if (arrA.length != arrB.length) return false;

      for (var i in arrA) {
        if (arrA[i] != arrB[i]) return false;
      }
      return true;
    }
    // Test if the given call was already queued, and if so, don't add it again.
    for (var i in JSEvents.deferredCalls) {
      var call = JSEvents.deferredCalls[i];
      if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
        return;
      }
    }
    JSEvents.deferredCalls.push({
      targetFunction: targetFunction,
      precedence: precedence,
      argsList: argsList
    });

    JSEvents.deferredCalls.sort(function (x, y) { return x.precedence < y.precedence; });
  }, removeDeferredCalls: function (targetFunction) {
    for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
      if (JSEvents.deferredCalls[i].targetFunction == targetFunction) {
        JSEvents.deferredCalls.splice(i, 1);
        --i;
      }
    }
  }, canPerformEventHandlerRequests: function () {
    return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls;
  }, runDeferredCalls: function () {
    if (!JSEvents.canPerformEventHandlerRequests()) {
      return;
    }
    for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
      var call = JSEvents.deferredCalls[i];
      JSEvents.deferredCalls.splice(i, 1);
      --i;
      call.targetFunction.apply(null, call.argsList);
    }
  }, eventHandlers: [], removeAllHandlersOnTarget: function (target, eventTypeString) {
    for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
      if (JSEvents.eventHandlers[i].target == target &&
        (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i].eventTypeString)) {
        JSEvents._removeHandler(i--);
      }
    }
  }, _removeHandler: function (i) {
    var h = JSEvents.eventHandlers[i];
    h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
    JSEvents.eventHandlers.splice(i, 1);
  }, registerOrRemoveHandler: function (eventHandler) {
    var jsEventHandler = function jsEventHandler(event) {
      // Increment nesting count for the event handler.
      ++JSEvents.inEventHandler;
      JSEvents.currentEventHandler = eventHandler;
      // Process any old deferred calls the user has placed.
      JSEvents.runDeferredCalls();
      // Process the actual event, calls back to user C code handler.
      eventHandler.handlerFunc(event);
      // Process any new deferred calls that were placed right now from this event handler.
      JSEvents.runDeferredCalls();
      // Out of event handler - restore nesting count.
      --JSEvents.inEventHandler;
    };

    if (eventHandler.callbackfunc) {
      eventHandler.eventListenerFunc = jsEventHandler;
      eventHandler.target.addEventListener(eventHandler.eventTypeString, jsEventHandler, eventHandler.useCapture);
      JSEvents.eventHandlers.push(eventHandler);
      JSEvents.registerRemoveEventListeners();
    } else {
      for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
        if (JSEvents.eventHandlers[i].target == eventHandler.target
          && JSEvents.eventHandlers[i].eventTypeString == eventHandler.eventTypeString) {
          JSEvents._removeHandler(i--);
        }
      }
    }
  }, getNodeNameForTarget: function (target) {
    if (!target) return '';
    if (target == window) return '#window';
    if (target == screen) return '#screen';
    return (target && target.nodeName) ? target.nodeName : '';
  }, fullscreenEnabled: function () {
    return document.fullscreenEnabled
      // Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitFullscreenEnabled.
      // TODO: If Safari at some point ships with unprefixed version, update the version check above.
      || document.webkitFullscreenEnabled
      ;
  }
};

var currentFullscreenStrategy = {};

function maybeCStringToJsString(cString) {
  // "cString > 2" checks if the input is a number, and isn't of the special
  // values we accept here, EMSCRIPTEN_EVENT_TARGET_* (which map to 0, 1, 2).
  // In other words, if cString > 2 then it's a pointer to a valid place in
  // memory, and points to a C string.
  return cString > 2 ? UTF8ToString(cString) : cString;
}

var specialHTMLTargets = [0, typeof document != 'undefined' ? document : 0, typeof window != 'undefined' ? window : 0];
function findEventTarget(target) {
  target = maybeCStringToJsString(target);
  var domElement = specialHTMLTargets[target] || (typeof document != 'undefined' ? document.querySelector(target) : undefined);
  return domElement;
}
function findCanvasEventTarget(target) { return findEventTarget(target); }
function _emscripten_get_canvas_element_size(target, width, height) {
  var canvas = findCanvasEventTarget(target);
  if (!canvas) return -4;
  HEAP32[((width) >> 2)] = canvas.width;
  HEAP32[((height) >> 2)] = canvas.height;
}
function getCanvasElementSize(target) {
  return withStackSave(function () {
    var w = stackAlloc(8);
    var h = w + 4;

    var targetInt = stackAlloc(target.id.length + 1);
    stringToUTF8(target.id, targetInt, target.id.length + 1);
    var ret = _emscripten_get_canvas_element_size(targetInt, w, h);
    var size = [HEAP32[((w) >> 2)], HEAP32[((h) >> 2)]];
    return size;
  });
}

function _emscripten_set_canvas_element_size(target, width, height) {
  var canvas = findCanvasEventTarget(target);
  if (!canvas) return -4;
  canvas.width = width;
  canvas.height = height;
  return 0;
}
function setCanvasElementSize(target, width, height) {
  if (!target.controlTransferredOffscreen) {
    target.width = width;
    target.height = height;
  } else {
    // This function is being called from high-level JavaScript code instead of asm.js/Wasm,
    // and it needs to synchronously proxy over to another thread, so marshal the string onto the heap to do the call.
    withStackSave(function () {
      var targetInt = stackAlloc(target.id.length + 1);
      stringToUTF8(target.id, targetInt, target.id.length + 1);
      _emscripten_set_canvas_element_size(targetInt, width, height);
    });
  }
}
function registerRestoreOldStyle(canvas) {
  var canvasSize = getCanvasElementSize(canvas);
  var oldWidth = canvasSize[0];
  var oldHeight = canvasSize[1];
  var oldCssWidth = canvas.style.width;
  var oldCssHeight = canvas.style.height;
  var oldBackgroundColor = canvas.style.backgroundColor; // Chrome reads color from here.
  var oldDocumentBackgroundColor = document.body.style.backgroundColor; // IE11 reads color from here.
  // Firefox always has black background color.
  var oldPaddingLeft = canvas.style.paddingLeft; // Chrome, FF, Safari
  var oldPaddingRight = canvas.style.paddingRight;
  var oldPaddingTop = canvas.style.paddingTop;
  var oldPaddingBottom = canvas.style.paddingBottom;
  var oldMarginLeft = canvas.style.marginLeft; // IE11
  var oldMarginRight = canvas.style.marginRight;
  var oldMarginTop = canvas.style.marginTop;
  var oldMarginBottom = canvas.style.marginBottom;
  var oldDocumentBodyMargin = document.body.style.margin;
  var oldDocumentOverflow = document.documentElement.style.overflow; // Chrome, Firefox
  var oldDocumentScroll = document.body.scroll; // IE
  var oldImageRendering = canvas.style.imageRendering;

  function restoreOldStyle() {
    var fullscreenElement = document.fullscreenElement
      || document.webkitFullscreenElement
      || document.msFullscreenElement
      ;
    if (!fullscreenElement) {
      document.removeEventListener('fullscreenchange', restoreOldStyle);

      // Unprefixed Fullscreen API shipped in Chromium 71 (https://bugs.chromium.org/p/chromium/issues/detail?id=383813)
      // As of Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitfullscreenchange. TODO: revisit this check once Safari ships unprefixed version.
      document.removeEventListener('webkitfullscreenchange', restoreOldStyle);

      setCanvasElementSize(canvas, oldWidth, oldHeight);

      canvas.style.width = oldCssWidth;
      canvas.style.height = oldCssHeight;
      canvas.style.backgroundColor = oldBackgroundColor; // Chrome
      // IE11 hack: assigning 'undefined' or an empty string to document.body.style.backgroundColor has no effect, so first assign back the default color
      // before setting the undefined value. Setting undefined value is also important, or otherwise we would later treat that as something that the user
      // had explicitly set so subsequent fullscreen transitions would not set background color properly.
      if (!oldDocumentBackgroundColor) document.body.style.backgroundColor = 'white';
      document.body.style.backgroundColor = oldDocumentBackgroundColor; // IE11
      canvas.style.paddingLeft = oldPaddingLeft; // Chrome, FF, Safari
      canvas.style.paddingRight = oldPaddingRight;
      canvas.style.paddingTop = oldPaddingTop;
      canvas.style.paddingBottom = oldPaddingBottom;
      canvas.style.marginLeft = oldMarginLeft; // IE11
      canvas.style.marginRight = oldMarginRight;
      canvas.style.marginTop = oldMarginTop;
      canvas.style.marginBottom = oldMarginBottom;
      document.body.style.margin = oldDocumentBodyMargin;
      document.documentElement.style.overflow = oldDocumentOverflow; // Chrome, Firefox
      document.body.scroll = oldDocumentScroll; // IE
      canvas.style.imageRendering = oldImageRendering;
      if (canvas.GLctxObject) canvas.GLctxObject.GLctx.viewport(0, 0, oldWidth, oldHeight);

      if (currentFullscreenStrategy.canvasResizedCallback) {
        (function (a1, a2, a3) { return dynCall_iiii.apply(null, [currentFullscreenStrategy.canvasResizedCallback, a1, a2, a3]); })(37, 0, currentFullscreenStrategy.canvasResizedCallbackUserData);
      }
    }
  }
  document.addEventListener('fullscreenchange', restoreOldStyle);
  // Unprefixed Fullscreen API shipped in Chromium 71 (https://bugs.chromium.org/p/chromium/issues/detail?id=383813)
  // As of Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitfullscreenchange. TODO: revisit this check once Safari ships unprefixed version.
  document.addEventListener('webkitfullscreenchange', restoreOldStyle);
  return restoreOldStyle;
}

function setLetterbox(element, topBottom, leftRight) {
  // Cannot use margin to specify letterboxes in FF or Chrome, since those ignore margins in fullscreen mode.
  element.style.paddingLeft = element.style.paddingRight = leftRight + 'px';
  element.style.paddingTop = element.style.paddingBottom = topBottom + 'px';
}

function getBoundingClientRect(e) {
  return specialHTMLTargets.indexOf(e) < 0 ? e.getBoundingClientRect() : { 'left': 0, 'top': 0 };
}
function _JSEvents_resizeCanvasForFullscreen(target, strategy) {
  var restoreOldStyle = registerRestoreOldStyle(target);
  var cssWidth = strategy.softFullscreen ? innerWidth : screen.width;
  var cssHeight = strategy.softFullscreen ? innerHeight : screen.height;
  var rect = getBoundingClientRect(target);
  var windowedCssWidth = rect.width;
  var windowedCssHeight = rect.height;
  var canvasSize = getCanvasElementSize(target);
  var windowedRttWidth = canvasSize[0];
  var windowedRttHeight = canvasSize[1];

  if (strategy.scaleMode == 3) {
    setLetterbox(target, (cssHeight - windowedCssHeight) / 2, (cssWidth - windowedCssWidth) / 2);
    cssWidth = windowedCssWidth;
    cssHeight = windowedCssHeight;
  } else if (strategy.scaleMode == 2) {
    if (cssWidth * windowedRttHeight < windowedRttWidth * cssHeight) {
      var desiredCssHeight = windowedRttHeight * cssWidth / windowedRttWidth;
      setLetterbox(target, (cssHeight - desiredCssHeight) / 2, 0);
      cssHeight = desiredCssHeight;
    } else {
      var desiredCssWidth = windowedRttWidth * cssHeight / windowedRttHeight;
      setLetterbox(target, 0, (cssWidth - desiredCssWidth) / 2);
      cssWidth = desiredCssWidth;
    }
  }

  // If we are adding padding, must choose a background color or otherwise Chrome will give the
  // padding a default white color. Do it only if user has not customized their own background color.
  if (!target.style.backgroundColor) target.style.backgroundColor = 'black';
  // IE11 does the same, but requires the color to be set in the document body.
  if (!document.body.style.backgroundColor) document.body.style.backgroundColor = 'black'; // IE11
  // Firefox always shows black letterboxes independent of style color.

  target.style.width = cssWidth + 'px';
  target.style.height = cssHeight + 'px';

  if (strategy.filteringMode == 1) {
    target.style.imageRendering = 'optimizeSpeed';
    target.style.imageRendering = '-moz-crisp-edges';
    target.style.imageRendering = '-o-crisp-edges';
    target.style.imageRendering = '-webkit-optimize-contrast';
    target.style.imageRendering = 'optimize-contrast';
    target.style.imageRendering = 'crisp-edges';
    target.style.imageRendering = 'pixelated';
  }

  var dpiScale = (strategy.canvasResolutionScaleMode == 2) ? devicePixelRatio : 1;
  if (strategy.canvasResolutionScaleMode != 0) {
    var newWidth = (cssWidth * dpiScale) | 0;
    var newHeight = (cssHeight * dpiScale) | 0;
    setCanvasElementSize(target, newWidth, newHeight);
    if (target.GLctxObject) target.GLctxObject.GLctx.viewport(0, 0, newWidth, newHeight);
  }
  return restoreOldStyle;
}
function _JSEvents_requestFullscreen(target, strategy) {
  // EMSCRIPTEN_FULLSCREEN_SCALE_DEFAULT + EMSCRIPTEN_FULLSCREEN_CANVAS_SCALE_NONE is a mode where no extra logic is performed to the DOM elements.
  if (strategy.scaleMode != 0 || strategy.canvasResolutionScaleMode != 0) {
    _JSEvents_resizeCanvasForFullscreen(target, strategy);
  }

  if (target.requestFullscreen) {
    target.requestFullscreen();
  } else if (target.webkitRequestFullscreen) {
    target.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
  } else {
    return JSEvents.fullscreenEnabled() ? -3 : -1;
  }

  currentFullscreenStrategy = strategy;

  if (strategy.canvasResizedCallback) {
    (function (a1, a2, a3) { return dynCall_iiii.apply(null, [strategy.canvasResizedCallback, a1, a2, a3]); })(37, 0, strategy.canvasResizedCallbackUserData);
  }

  return 0;
}
function _emscripten_exit_fullscreen() {
  if (!JSEvents.fullscreenEnabled()) return -1;
  // Make sure no queued up calls will fire after this.
  JSEvents.removeDeferredCalls(_JSEvents_requestFullscreen);

  var d = specialHTMLTargets[1];
  if (d.exitFullscreen) {
    d.fullscreenElement && d.exitFullscreen();
  } else if (d.webkitExitFullscreen) {
    d.webkitFullscreenElement && d.webkitExitFullscreen();
  } else {
    return -1;
  }

  return 0;
}

function requestPointerLock(target) {
  if (target.requestPointerLock) {
    target.requestPointerLock();
  } else if (target.msRequestPointerLock) {
    target.msRequestPointerLock();
  } else {
    // document.body is known to accept pointer lock, so use that to differentiate if the user passed a bad element,
    // or if the whole browser just doesn't support the feature.
    if (document.body.requestPointerLock
      || document.body.msRequestPointerLock
    ) {
      return -3;
    } else {
      return -1;
    }
  }
  return 0;
}
function _emscripten_exit_pointerlock() {
  // Make sure no queued up calls will fire after this.
  JSEvents.removeDeferredCalls(requestPointerLock);

  if (document.exitPointerLock) {
    document.exitPointerLock();
  } else if (document.msExitPointerLock) {
    document.msExitPointerLock();
  } else {
    return -1;
  }
  return 0;
}

function _emscripten_get_device_pixel_ratio() {
  return (typeof devicePixelRatio == 'number' && devicePixelRatio) || 1.0;
}

function _emscripten_get_element_css_size(target, width, height) {
  target = findEventTarget(target);
  if (!target) return -4;

  var rect = getBoundingClientRect(target);
  HEAPF64[((width) >> 3)] = rect.width;
  HEAPF64[((height) >> 3)] = rect.height;

  return 0;
}

function fillGamepadEventData(eventStruct, e) {
  HEAPF64[((eventStruct) >> 3)] = e.timestamp;
  for (var i = 0; i < e.axes.length; ++i) {
    HEAPF64[(((eventStruct + i * 8) + (16)) >> 3)] = e.axes[i];
  }
  for (var i = 0; i < e.buttons.length; ++i) {
    if (typeof e.buttons[i] == 'object') {
      HEAPF64[(((eventStruct + i * 8) + (528)) >> 3)] = e.buttons[i].value;
    } else {
      HEAPF64[(((eventStruct + i * 8) + (528)) >> 3)] = e.buttons[i];
    }
  }
  for (var i = 0; i < e.buttons.length; ++i) {
    if (typeof e.buttons[i] == 'object') {
      HEAP32[(((eventStruct + i * 4) + (1040)) >> 2)] = e.buttons[i].pressed;
    } else {
      // Assigning a boolean to HEAP32, that's ok, but Closure would like to warn about it:
      /** @suppress {checkTypes} */
      HEAP32[(((eventStruct + i * 4) + (1040)) >> 2)] = e.buttons[i] == 1;
    }
  }
  HEAP32[(((eventStruct) + (1296)) >> 2)] = e.connected;
  HEAP32[(((eventStruct) + (1300)) >> 2)] = e.index;
  HEAP32[(((eventStruct) + (8)) >> 2)] = e.axes.length;
  HEAP32[(((eventStruct) + (12)) >> 2)] = e.buttons.length;
  stringToUTF8(e.id, eventStruct + 1304, 64);
  stringToUTF8(e.mapping, eventStruct + 1368, 64);
}
function _emscripten_get_gamepad_status(index, gamepadState) {
  if (!JSEvents.lastGamepadState) throw 'emscripten_get_gamepad_status() can only be called after having first called emscripten_sample_gamepad_data() and that function has returned EMSCRIPTEN_RESULT_SUCCESS!';

  // INVALID_PARAM is returned on a Gamepad index that never was there.
  if (index < 0 || index >= JSEvents.lastGamepadState.length) return -5;

  // NO_DATA is returned on a Gamepad index that was removed.
  // For previously disconnected gamepads there should be an empty slot (null/undefined/false) at the index.
  // This is because gamepads must keep their original position in the array.
  // For example, removing the first of two gamepads produces [null/undefined/false, gamepad].
  if (!JSEvents.lastGamepadState[index]) return -7;

  fillGamepadEventData(gamepadState, JSEvents.lastGamepadState[index]);
  return 0;
}


function _emscripten_get_num_gamepads() {
  if (!JSEvents.lastGamepadState) throw 'emscripten_get_num_gamepads() can only be called after having first called emscripten_sample_gamepad_data() and that function has returned EMSCRIPTEN_RESULT_SUCCESS!';
  // N.B. Do not call emscripten_get_num_gamepads() unless having first called emscripten_sample_gamepad_data(), and that has returned EMSCRIPTEN_RESULT_SUCCESS.
  // Otherwise the following line will throw an exception.
  return JSEvents.lastGamepadState.length;
}

function _emscripten_get_screen_size(width, height) {
  HEAP32[((width) >> 2)] = screen.width;
  HEAP32[((height) >> 2)] = screen.height;
}

function _emscripten_glActiveTexture(x0) { GLctx['activeTexture'](x0) }

function _emscripten_glAttachShader(program, shader) {
  GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
}

function _emscripten_glBeginQueryEXT(target, id) {
  GLctx.disjointTimerQueryExt['beginQueryEXT'](target, GL.queries[id]);
}

function _emscripten_glBindAttribLocation(program, index, name) {
  GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name));
}

function _emscripten_glBindBuffer(target, buffer) {

  GLctx.bindBuffer(target, GL.buffers[buffer]);
}

function _emscripten_glBindFramebuffer(target, framebuffer) {

  GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);

}

function _emscripten_glBindRenderbuffer(target, renderbuffer) {
  GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
}

function _emscripten_glBindTexture(target, texture) {
  GLctx.bindTexture(target, GL.textures[texture]);
}

function _emscripten_glBindVertexArrayOES(vao) {
  GLctx['bindVertexArray'](GL.vaos[vao]);
}

function _emscripten_glBlendColor(x0, x1, x2, x3) { GLctx['blendColor'](x0, x1, x2, x3) }

function _emscripten_glBlendEquation(x0) { GLctx['blendEquation'](x0) }

function _emscripten_glBlendEquationSeparate(x0, x1) { GLctx['blendEquationSeparate'](x0, x1) }

function _emscripten_glBlendFunc(x0, x1) { GLctx['blendFunc'](x0, x1) }

function _emscripten_glBlendFuncSeparate(x0, x1, x2, x3) { GLctx['blendFuncSeparate'](x0, x1, x2, x3) }

function _emscripten_glBufferData(target, size, data, usage) {

  // N.b. here first form specifies a heap subarray, second form an integer size, so the ?: code here is polymorphic. It is advised to avoid
  // randomly mixing both uses in calling code, to avoid any potential JS engine JIT issues.
  GLctx.bufferData(target, data ? HEAPU8.subarray(data, data + size) : size, usage);
}

function _emscripten_glBufferSubData(target, offset, size, data) {
  GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size));
}

function _emscripten_glCheckFramebufferStatus(x0) { return GLctx['checkFramebufferStatus'](x0) }

function _emscripten_glClear(x0) { GLctx['clear'](x0) }

function _emscripten_glClearColor(x0, x1, x2, x3) { GLctx['clearColor'](x0, x1, x2, x3) }

function _emscripten_glClearDepthf(x0) { GLctx['clearDepth'](x0) }

function _emscripten_glClearStencil(x0) { GLctx['clearStencil'](x0) }

function _emscripten_glColorMask(red, green, blue, alpha) {
  GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
}

function _emscripten_glCompileShader(shader) {
  GLctx.compileShader(GL.shaders[shader]);
}

function _emscripten_glCompressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data) {
  GLctx['compressedTexImage2D'](target, level, internalFormat, width, height, border, data ? HEAPU8.subarray((data), (data + imageSize)) : null);
}

function _emscripten_glCompressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data) {
  GLctx['compressedTexSubImage2D'](target, level, xoffset, yoffset, width, height, format, data ? HEAPU8.subarray((data), (data + imageSize)) : null);
}

function _emscripten_glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) { GLctx['copyTexImage2D'](x0, x1, x2, x3, x4, x5, x6, x7) }

function _emscripten_glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) { GLctx['copyTexSubImage2D'](x0, x1, x2, x3, x4, x5, x6, x7) }

function _emscripten_glCreateProgram() {
  var id = GL.getNewId(GL.programs);
  var program = GLctx.createProgram();
  // Store additional information needed for each shader program:
  program.name = id;
  // Lazy cache results of glGetProgramiv(GL_ACTIVE_UNIFORM_MAX_LENGTH/GL_ACTIVE_ATTRIBUTE_MAX_LENGTH/GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH)
  program.maxUniformLength = program.maxAttributeLength = program.maxUniformBlockNameLength = 0;
  program.uniformIdCounter = 1;
  GL.programs[id] = program;
  return id;
}

function _emscripten_glCreateShader(shaderType) {
  var id = GL.getNewId(GL.shaders);
  GL.shaders[id] = GLctx.createShader(shaderType);

  return id;
}

function _emscripten_glCullFace(x0) { GLctx['cullFace'](x0) }

function _emscripten_glDeleteBuffers(n, buffers) {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((buffers) + (i * 4)) >> 2)];
    var buffer = GL.buffers[id];

    // From spec: "glDeleteBuffers silently ignores 0's and names that do not
    // correspond to existing buffer objects."
    if (!buffer) continue;

    GLctx.deleteBuffer(buffer);
    buffer.name = 0;
    GL.buffers[id] = null;

  }
}

function _emscripten_glDeleteFramebuffers(n, framebuffers) {
  for (var i = 0; i < n; ++i) {
    var id = HEAP32[(((framebuffers) + (i * 4)) >> 2)];
    var framebuffer = GL.framebuffers[id];
    if (!framebuffer) continue; // GL spec: "glDeleteFramebuffers silently ignores 0s and names that do not correspond to existing framebuffer objects".
    GLctx.deleteFramebuffer(framebuffer);
    framebuffer.name = 0;
    GL.framebuffers[id] = null;
  }
}

function _emscripten_glDeleteProgram(id) {
  if (!id) return;
  var program = GL.programs[id];
  if (!program) { // glDeleteProgram actually signals an error when deleting a nonexisting object, unlike some other GL delete functions.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  GLctx.deleteProgram(program);
  program.name = 0;
  GL.programs[id] = null;
}

function _emscripten_glDeleteQueriesEXT(n, ids) {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((ids) + (i * 4)) >> 2)];
    var query = GL.queries[id];
    if (!query) continue; // GL spec: "unused names in ids are ignored, as is the name zero."
    GLctx.disjointTimerQueryExt['deleteQueryEXT'](query);
    GL.queries[id] = null;
  }
}

function _emscripten_glDeleteRenderbuffers(n, renderbuffers) {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((renderbuffers) + (i * 4)) >> 2)];
    var renderbuffer = GL.renderbuffers[id];
    if (!renderbuffer) continue; // GL spec: "glDeleteRenderbuffers silently ignores 0s and names that do not correspond to existing renderbuffer objects".
    GLctx.deleteRenderbuffer(renderbuffer);
    renderbuffer.name = 0;
    GL.renderbuffers[id] = null;
  }
}

function _emscripten_glDeleteShader(id) {
  if (!id) return;
  var shader = GL.shaders[id];
  if (!shader) { // glDeleteShader actually signals an error when deleting a nonexisting object, unlike some other GL delete functions.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  GLctx.deleteShader(shader);
  GL.shaders[id] = null;
}

function _emscripten_glDeleteTextures(n, textures) {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((textures) + (i * 4)) >> 2)];
    var texture = GL.textures[id];
    if (!texture) continue; // GL spec: "glDeleteTextures silently ignores 0s and names that do not correspond to existing textures".
    GLctx.deleteTexture(texture);
    texture.name = 0;
    GL.textures[id] = null;
  }
}

function _emscripten_glDeleteVertexArraysOES(n, vaos) {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((vaos) + (i * 4)) >> 2)];
    GLctx['deleteVertexArray'](GL.vaos[id]);
    GL.vaos[id] = null;
  }
}

function _emscripten_glDepthFunc(x0) { GLctx['depthFunc'](x0) }

function _emscripten_glDepthMask(flag) {
  GLctx.depthMask(!!flag);
}

function _emscripten_glDepthRangef(x0, x1) { GLctx['depthRange'](x0, x1) }

function _emscripten_glDetachShader(program, shader) {
  GLctx.detachShader(GL.programs[program], GL.shaders[shader]);
}

function _emscripten_glDisable(x0) { GLctx['disable'](x0) }

function _emscripten_glDisableVertexAttribArray(index) {
  GLctx.disableVertexAttribArray(index);
}

function _emscripten_glDrawArrays(mode, first, count) {

  GLctx.drawArrays(mode, first, count);

}

function _emscripten_glDrawArraysInstancedANGLE(mode, first, count, primcount) {
  GLctx['drawArraysInstanced'](mode, first, count, primcount);
}

var tempFixedLengthArray = [];
function _emscripten_glDrawBuffersWEBGL(n, bufs) {

  var bufArray = tempFixedLengthArray[n];
  for (var i = 0; i < n; i++) {
    bufArray[i] = HEAP32[(((bufs) + (i * 4)) >> 2)];
  }

  GLctx['drawBuffers'](bufArray);
}

function _emscripten_glDrawElements(mode, count, type, indices) {

  GLctx.drawElements(mode, count, type, indices);

}

function _emscripten_glDrawElementsInstancedANGLE(mode, count, type, indices, primcount) {
  GLctx['drawElementsInstanced'](mode, count, type, indices, primcount);
}

function _emscripten_glEnable(x0) { GLctx['enable'](x0) }

function _emscripten_glEnableVertexAttribArray(index) {
  GLctx.enableVertexAttribArray(index);
}

function _emscripten_glEndQueryEXT(target) {
  GLctx.disjointTimerQueryExt['endQueryEXT'](target);
}

function _emscripten_glFinish() { GLctx['finish']() }

function _emscripten_glFlush() { GLctx['flush']() }

function _emscripten_glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
  GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget,
    GL.renderbuffers[renderbuffer]);
}

function _emscripten_glFramebufferTexture2D(target, attachment, textarget, texture, level) {
  GLctx.framebufferTexture2D(target, attachment, textarget,
    GL.textures[texture], level);
}

function _emscripten_glFrontFace(x0) { GLctx['frontFace'](x0) }

function __glGenObject(n, buffers, createFunction, objectTable
) {
  for (var i = 0; i < n; i++) {
    var buffer = GLctx[createFunction]();
    var id = buffer && GL.getNewId(objectTable);
    if (buffer) {
      buffer.name = id;
      objectTable[id] = buffer;
    } else {
      GL.recordError(0x502 /* GL_INVALID_OPERATION */);
    }
    HEAP32[(((buffers) + (i * 4)) >> 2)] = id;
  }
}
function _emscripten_glGenBuffers(n, buffers) {
  __glGenObject(n, buffers, 'createBuffer', GL.buffers
  );
}

function _emscripten_glGenFramebuffers(n, ids) {
  __glGenObject(n, ids, 'createFramebuffer', GL.framebuffers
  );
}

function _emscripten_glGenQueriesEXT(n, ids) {
  for (var i = 0; i < n; i++) {
    var query = GLctx.disjointTimerQueryExt['createQueryEXT']();
    if (!query) {
      GL.recordError(0x502 /* GL_INVALID_OPERATION */);
      while (i < n) HEAP32[(((ids) + (i++ * 4)) >> 2)] = 0;
      return;
    }
    var id = GL.getNewId(GL.queries);
    query.name = id;
    GL.queries[id] = query;
    HEAP32[(((ids) + (i * 4)) >> 2)] = id;
  }
}

function _emscripten_glGenRenderbuffers(n, renderbuffers) {
  __glGenObject(n, renderbuffers, 'createRenderbuffer', GL.renderbuffers
  );
}

function _emscripten_glGenTextures(n, textures) {
  __glGenObject(n, textures, 'createTexture', GL.textures
  );
}

function _emscripten_glGenVertexArraysOES(n, arrays) {
  __glGenObject(n, arrays, 'createVertexArray', GL.vaos
  );
}

function _emscripten_glGenerateMipmap(x0) { GLctx['generateMipmap'](x0) }

function __glGetActiveAttribOrUniform(funcName, program, index, bufSize, length, size, type, name) {
  program = GL.programs[program];
  var info = GLctx[funcName](program, index);
  if (info) { // If an error occurs, nothing will be written to length, size and type and name.
    var numBytesWrittenExclNull = name && stringToUTF8(info.name, name, bufSize);
    if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
    if (size) HEAP32[((size) >> 2)] = info.size;
    if (type) HEAP32[((type) >> 2)] = info.type;
  }
}
function _emscripten_glGetActiveAttrib(program, index, bufSize, length, size, type, name) {
  __glGetActiveAttribOrUniform('getActiveAttrib', program, index, bufSize, length, size, type, name);
}

function _emscripten_glGetActiveUniform(program, index, bufSize, length, size, type, name) {
  __glGetActiveAttribOrUniform('getActiveUniform', program, index, bufSize, length, size, type, name);
}

function _emscripten_glGetAttachedShaders(program, maxCount, count, shaders) {
  var result = GLctx.getAttachedShaders(GL.programs[program]);
  var len = result.length;
  if (len > maxCount) {
    len = maxCount;
  }
  HEAP32[((count) >> 2)] = len;
  for (var i = 0; i < len; ++i) {
    var id = GL.shaders.indexOf(result[i]);
    HEAP32[(((shaders) + (i * 4)) >> 2)] = id;
  }
}

function _emscripten_glGetAttribLocation(program, name) {
  return GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
}

function readI53FromI64(ptr) {
  return HEAPU32[ptr >> 2] + HEAP32[ptr + 4 >> 2] * 4294967296;
}

function readI53FromU64(ptr) {
  return HEAPU32[ptr >> 2] + HEAPU32[ptr + 4 >> 2] * 4294967296;
}
function writeI53ToI64(ptr, num) {
  HEAPU32[ptr >> 2] = num;
  HEAPU32[ptr + 4 >> 2] = (num - HEAPU32[ptr >> 2]) / 4294967296;
  var deserialized = (num >= 0) ? readI53FromU64(ptr) : readI53FromI64(ptr);
  if (deserialized != num) warnOnce('writeI53ToI64() out of range: serialized JS Number ' + num + ' to Wasm heap as bytes lo=0x' + HEAPU32[ptr >> 2].toString(16) + ', hi=0x' + HEAPU32[ptr + 4 >> 2].toString(16) + ', which deserializes back to ' + deserialized + ' instead!');
}
function emscriptenWebGLGet(name_, p, type) {
  // Guard against user passing a null pointer.
  // Note that GLES2 spec does not say anything about how passing a null pointer should be treated.
  // Testing on desktop core GL 3, the application crashes on glGetIntegerv to a null pointer, but
  // better to report an error instead of doing anything random.
  if (!p) {
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var ret = undefined;
  switch (name_) { // Handle a few trivial GLES values
    case 0x8DFA: // GL_SHADER_COMPILER
      ret = 1;
      break;
    case 0x8DF8: // GL_SHADER_BINARY_FORMATS
      if (type != 0 && type != 1) {
        GL.recordError(0x500); // GL_INVALID_ENUM
      }
      return; // Do not write anything to the out pointer, since no binary formats are supported.
    case 0x8DF9: // GL_NUM_SHADER_BINARY_FORMATS
      ret = 0;
      break;
    case 0x86A2: // GL_NUM_COMPRESSED_TEXTURE_FORMATS
      // WebGL doesn't have GL_NUM_COMPRESSED_TEXTURE_FORMATS (it's obsolete since GL_COMPRESSED_TEXTURE_FORMATS returns a JS array that can be queried for length),
      // so implement it ourselves to allow C++ GLES2 code get the length.
      var formats = GLctx.getParameter(0x86A3 /*GL_COMPRESSED_TEXTURE_FORMATS*/);
      ret = formats ? formats.length : 0;
      break;

  }

  if (ret === undefined) {
    var result = GLctx.getParameter(name_);
    switch (typeof result) {
      case "number":
        ret = result;
        break;
      case "boolean":
        ret = result ? 1 : 0;
        break;
      case "string":
        GL.recordError(0x500); // GL_INVALID_ENUM
        return;
      case "object":
        if (result === null) {
          // null is a valid result for some (e.g., which buffer is bound - perhaps nothing is bound), but otherwise
          // can mean an invalid name_, which we need to report as an error
          switch (name_) {
            case 0x8894: // ARRAY_BUFFER_BINDING
            case 0x8B8D: // CURRENT_PROGRAM
            case 0x8895: // ELEMENT_ARRAY_BUFFER_BINDING
            case 0x8CA6: // FRAMEBUFFER_BINDING or DRAW_FRAMEBUFFER_BINDING
            case 0x8CA7: // RENDERBUFFER_BINDING
            case 0x8069: // TEXTURE_BINDING_2D
            case 0x85B5: // WebGL 2 GL_VERTEX_ARRAY_BINDING, or WebGL 1 extension OES_vertex_array_object GL_VERTEX_ARRAY_BINDING_OES
            case 0x8514: { // TEXTURE_BINDING_CUBE_MAP
              ret = 0;
              break;
            }
            default: {
              GL.recordError(0x500); // GL_INVALID_ENUM
              return;
            }
          }
        } else if (result instanceof Float32Array ||
          result instanceof Uint32Array ||
          result instanceof Int32Array ||
          result instanceof Array) {
          for (var i = 0; i < result.length; ++i) {
            switch (type) {
              case 0: HEAP32[(((p) + (i * 4)) >> 2)] = result[i]; break;
              case 2: HEAPF32[(((p) + (i * 4)) >> 2)] = result[i]; break;
              case 4: HEAP8[(((p) + (i)) >> 0)] = result[i] ? 1 : 0; break;
            }
          }
          return;
        } else {
          try {
            ret = result.name | 0;
          } catch (e) {
            GL.recordError(0x500); // GL_INVALID_ENUM
            err('GL_INVALID_ENUM in glGet' + type + 'v: Unknown object returned from WebGL getParameter(' + name_ + ')! (error: ' + e + ')');
            return;
          }
        }
        break;
      default:
        GL.recordError(0x500); // GL_INVALID_ENUM
        err('GL_INVALID_ENUM in glGet' + type + 'v: Native code calling glGet' + type + 'v(' + name_ + ') and it returns ' + result + ' of type ' + typeof (result) + '!');
        return;
    }
  }

  switch (type) {
    case 1: writeI53ToI64(p, ret); break;
    case 0: HEAP32[((p) >> 2)] = ret; break;
    case 2: HEAPF32[((p) >> 2)] = ret; break;
    case 4: HEAP8[((p) >> 0)] = ret ? 1 : 0; break;
  }
}
function _emscripten_glGetBooleanv(name_, p) {
  emscriptenWebGLGet(name_, p, 4);
}

function _emscripten_glGetBufferParameteriv(target, value, data) {
  if (!data) {
    // GLES2 specification does not specify how to behave if data is a null pointer. Since calling this function does not make sense
    // if data == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((data) >> 2)] = GLctx.getBufferParameter(target, value);
}

function _emscripten_glGetError() {
  var error = GLctx.getError() || GL.lastError;
  GL.lastError = 0/*GL_NO_ERROR*/;
  return error;
}

function _emscripten_glGetFloatv(name_, p) {
  emscriptenWebGLGet(name_, p, 2);
}

function _emscripten_glGetFramebufferAttachmentParameteriv(target, attachment, pname, params) {
  var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
  if (result instanceof WebGLRenderbuffer ||
    result instanceof WebGLTexture) {
    result = result.name | 0;
  }
  HEAP32[((params) >> 2)] = result;
}

function _emscripten_glGetIntegerv(name_, p) {
  emscriptenWebGLGet(name_, p, 0);
}

function _emscripten_glGetProgramInfoLog(program, maxLength, length, infoLog) {
  var log = GLctx.getProgramInfoLog(GL.programs[program]);
  if (log === null) log = '(unknown error)';
  var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
  if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
}

function _emscripten_glGetProgramiv(program, pname, p) {
  if (!p) {
    // GLES2 specification does not specify how to behave if p is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }

  if (program >= GL.counter) {
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }

  program = GL.programs[program];

  if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
    var log = GLctx.getProgramInfoLog(program);
    if (log === null) log = '(unknown error)';
    HEAP32[((p) >> 2)] = log.length + 1;
  } else if (pname == 0x8B87 /* GL_ACTIVE_UNIFORM_MAX_LENGTH */) {
    if (!program.maxUniformLength) {
      for (var i = 0; i < GLctx.getProgramParameter(program, 0x8B86/*GL_ACTIVE_UNIFORMS*/); ++i) {
        program.maxUniformLength = Math.max(program.maxUniformLength, GLctx.getActiveUniform(program, i).name.length + 1);
      }
    }
    HEAP32[((p) >> 2)] = program.maxUniformLength;
  } else if (pname == 0x8B8A /* GL_ACTIVE_ATTRIBUTE_MAX_LENGTH */) {
    if (!program.maxAttributeLength) {
      for (var i = 0; i < GLctx.getProgramParameter(program, 0x8B89/*GL_ACTIVE_ATTRIBUTES*/); ++i) {
        program.maxAttributeLength = Math.max(program.maxAttributeLength, GLctx.getActiveAttrib(program, i).name.length + 1);
      }
    }
    HEAP32[((p) >> 2)] = program.maxAttributeLength;
  } else if (pname == 0x8A35 /* GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH */) {
    if (!program.maxUniformBlockNameLength) {
      for (var i = 0; i < GLctx.getProgramParameter(program, 0x8A36/*GL_ACTIVE_UNIFORM_BLOCKS*/); ++i) {
        program.maxUniformBlockNameLength = Math.max(program.maxUniformBlockNameLength, GLctx.getActiveUniformBlockName(program, i).length + 1);
      }
    }
    HEAP32[((p) >> 2)] = program.maxUniformBlockNameLength;
  } else {
    HEAP32[((p) >> 2)] = GLctx.getProgramParameter(program, pname);
  }
}

function _emscripten_glGetQueryObjecti64vEXT(id, pname, params) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var query = GL.queries[id];
  var param;
  {
    param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
  }
  var ret;
  if (typeof param == 'boolean') {
    ret = param ? 1 : 0;
  } else {
    ret = param;
  }
  writeI53ToI64(params, ret);
}

function _emscripten_glGetQueryObjectivEXT(id, pname, params) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var query = GL.queries[id];
  var param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
  var ret;
  if (typeof param == 'boolean') {
    ret = param ? 1 : 0;
  } else {
    ret = param;
  }
  HEAP32[((params) >> 2)] = ret;
}

function _emscripten_glGetQueryObjectui64vEXT(id, pname, params) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var query = GL.queries[id];
  var param;
  {
    param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
  }
  var ret;
  if (typeof param == 'boolean') {
    ret = param ? 1 : 0;
  } else {
    ret = param;
  }
  writeI53ToI64(params, ret);
}

function _emscripten_glGetQueryObjectuivEXT(id, pname, params) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var query = GL.queries[id];
  var param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
  var ret;
  if (typeof param == 'boolean') {
    ret = param ? 1 : 0;
  } else {
    ret = param;
  }
  HEAP32[((params) >> 2)] = ret;
}

function _emscripten_glGetQueryivEXT(target, pname, params) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((params) >> 2)] = GLctx.disjointTimerQueryExt['getQueryEXT'](target, pname);
}

function _emscripten_glGetRenderbufferParameteriv(target, pname, params) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if params == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((params) >> 2)] = GLctx.getRenderbufferParameter(target, pname);
}

function _emscripten_glGetShaderInfoLog(shader, maxLength, length, infoLog) {
  var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
  if (log === null) log = '(unknown error)';
  var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
  if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
}

function _emscripten_glGetShaderPrecisionFormat(shaderType, precisionType, range, precision) {
  var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
  HEAP32[((range) >> 2)] = result.rangeMin;
  HEAP32[(((range) + (4)) >> 2)] = result.rangeMax;
  HEAP32[((precision) >> 2)] = result.precision;
}

function _emscripten_glGetShaderSource(shader, bufSize, length, source) {
  var result = GLctx.getShaderSource(GL.shaders[shader]);
  if (!result) return; // If an error occurs, nothing will be written to length or source.
  var numBytesWrittenExclNull = (bufSize > 0 && source) ? stringToUTF8(result, source, bufSize) : 0;
  if (length) HEAP32[((length) >> 2)] = numBytesWrittenExclNull;
}

function _emscripten_glGetShaderiv(shader, pname, p) {
  if (!p) {
    // GLES2 specification does not specify how to behave if p is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (log === null) log = '(unknown error)';
    // The GLES2 specification says that if the shader has an empty info log,
    // a value of 0 is returned. Otherwise the log has a null char appended.
    // (An empty string is falsey, so we can just check that instead of
    // looking at log.length.)
    var logLength = log ? log.length + 1 : 0;
    HEAP32[((p) >> 2)] = logLength;
  } else if (pname == 0x8B88) { // GL_SHADER_SOURCE_LENGTH
    var source = GLctx.getShaderSource(GL.shaders[shader]);
    // source may be a null, or the empty string, both of which are falsey
    // values that we report a 0 length for.
    var sourceLength = source ? source.length + 1 : 0;
    HEAP32[((p) >> 2)] = sourceLength;
  } else {
    HEAP32[((p) >> 2)] = GLctx.getShaderParameter(GL.shaders[shader], pname);
  }
}

function stringToNewUTF8(jsString) {
  var length = lengthBytesUTF8(jsString) + 1;
  var cString = _malloc(length);
  stringToUTF8(jsString, cString, length);
  return cString;
}
function _emscripten_glGetString(name_) {
  var ret = GL.stringCache[name_];
  if (!ret) {
    switch (name_) {
      case 0x1F03 /* GL_EXTENSIONS */:
        var exts = GLctx.getSupportedExtensions() || []; // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
        exts = exts.concat(exts.map(function (e) { return "GL_" + e; }));
        ret = stringToNewUTF8(exts.join(' '));
        break;
      case 0x1F00 /* GL_VENDOR */:
      case 0x1F01 /* GL_RENDERER */:
      case 0x9245 /* UNMASKED_VENDOR_WEBGL */:
      case 0x9246 /* UNMASKED_RENDERER_WEBGL */:
        var s = GLctx.getParameter(name_);
        if (!s) {
          GL.recordError(0x500/*GL_INVALID_ENUM*/);
        }
        ret = s && stringToNewUTF8(s);
        break;

      case 0x1F02 /* GL_VERSION */:
        var glVersion = GLctx.getParameter(0x1F02 /*GL_VERSION*/);
        // return GLES version string corresponding to the version of the WebGL context
        {
          glVersion = 'OpenGL ES 2.0 (' + glVersion + ')';
        }
        ret = stringToNewUTF8(glVersion);
        break;
      case 0x8B8C /* GL_SHADING_LANGUAGE_VERSION */:
        var glslVersion = GLctx.getParameter(0x8B8C /*GL_SHADING_LANGUAGE_VERSION*/);
        // extract the version number 'N.M' from the string 'WebGL GLSL ES N.M ...'
        var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
        var ver_num = glslVersion.match(ver_re);
        if (ver_num !== null) {
          if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + '0'; // ensure minor version has 2 digits
          glslVersion = 'OpenGL ES GLSL ES ' + ver_num[1] + ' (' + glslVersion + ')';
        }
        ret = stringToNewUTF8(glslVersion);
        break;
      default:
        GL.recordError(0x500/*GL_INVALID_ENUM*/);
      // fall through
    }
    GL.stringCache[name_] = ret;
  }
  return ret;
}

function _emscripten_glGetTexParameterfv(target, pname, params) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAPF32[((params) >> 2)] = GLctx.getTexParameter(target, pname);
}

function _emscripten_glGetTexParameteriv(target, pname, params) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if p == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((params) >> 2)] = GLctx.getTexParameter(target, pname);
}

/** @noinline */
function webglGetLeftBracePos(name) {
  return name.slice(-1) == ']' && name.lastIndexOf('[');
}
function webglPrepareUniformLocationsBeforeFirstUse(program) {
  var uniformLocsById = program.uniformLocsById, // Maps GLuint -> WebGLUniformLocation
    uniformSizeAndIdsByName = program.uniformSizeAndIdsByName, // Maps name -> [uniform array length, GLuint]
    i, j;

  // On the first time invocation of glGetUniformLocation on this shader program:
  // initialize cache data structures and discover which uniforms are arrays.
  if (!uniformLocsById) {
    // maps GLint integer locations to WebGLUniformLocations
    program.uniformLocsById = uniformLocsById = {};
    // maps integer locations back to uniform name strings, so that we can lazily fetch uniform array locations
    program.uniformArrayNamesById = {};

    for (i = 0; i < GLctx.getProgramParameter(program, 0x8B86/*GL_ACTIVE_UNIFORMS*/); ++i) {
      var u = GLctx.getActiveUniform(program, i);
      var nm = u.name;
      var sz = u.size;
      var lb = webglGetLeftBracePos(nm);
      var arrayName = lb > 0 ? nm.slice(0, lb) : nm;

      // Assign a new location.
      var id = program.uniformIdCounter;
      program.uniformIdCounter += sz;
      // Eagerly get the location of the uniformArray[0] base element.
      // The remaining indices >0 will be left for lazy evaluation to
      // improve performance. Those may never be needed to fetch, if the
      // application fills arrays always in full starting from the first
      // element of the array.
      uniformSizeAndIdsByName[arrayName] = [sz, id];

      // Store placeholder integers in place that highlight that these
      // >0 index locations are array indices pending population.
      for (j = 0; j < sz; ++j) {
        uniformLocsById[id] = j;
        program.uniformArrayNamesById[id++] = arrayName;
      }
    }
  }
}
function _emscripten_glGetUniformLocation(program, name) {

  name = UTF8ToString(name);

  if (program = GL.programs[program]) {
    webglPrepareUniformLocationsBeforeFirstUse(program);
    var uniformLocsById = program.uniformLocsById; // Maps GLuint -> WebGLUniformLocation
    var arrayIndex = 0;
    var uniformBaseName = name;

    // Invariant: when populating integer IDs for uniform locations, we must maintain the precondition that
    // arrays reside in contiguous addresses, i.e. for a 'vec4 colors[10];', colors[4] must be at location colors[0]+4.
    // However, user might call glGetUniformLocation(program, "colors") for an array, so we cannot discover based on the user
    // input arguments whether the uniform we are dealing with is an array. The only way to discover which uniforms are arrays
    // is to enumerate over all the active uniforms in the program.
    var leftBrace = webglGetLeftBracePos(name);

    // If user passed an array accessor "[index]", parse the array index off the accessor.
    if (leftBrace > 0) {
      arrayIndex = jstoi_q(name.slice(leftBrace + 1)) >>> 0; // "index]", coerce parseInt(']') with >>>0 to treat "foo[]" as "foo[0]" and foo[-1] as unsigned out-of-bounds.
      uniformBaseName = name.slice(0, leftBrace);
    }

    // Have we cached the location of this uniform before?
    var sizeAndId = program.uniformSizeAndIdsByName[uniformBaseName]; // A pair [array length, GLint of the uniform location]

    // If an uniform with this name exists, and if its index is within the array limits (if it's even an array),
    // query the WebGLlocation, or return an existing cached location.
    if (sizeAndId && arrayIndex < sizeAndId[0]) {
      arrayIndex += sizeAndId[1]; // Add the base location of the uniform to the array index offset.
      if ((uniformLocsById[arrayIndex] = uniformLocsById[arrayIndex] || GLctx.getUniformLocation(program, name))) {
        return arrayIndex;
      }
    }
  }
  else {
    // N.b. we are currently unable to distinguish between GL program IDs that never existed vs GL program IDs that have been deleted,
    // so report GL_INVALID_VALUE in both cases.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
  }
  return -1;
}

function webglGetUniformLocation(location) {
  var p = GLctx.currentProgram;

  if (p) {
    var webglLoc = p.uniformLocsById[location];
    // p.uniformLocsById[location] stores either an integer, or a WebGLUniformLocation.

    // If an integer, we have not yet bound the location, so do it now. The integer value specifies the array index
    // we should bind to.
    if (typeof webglLoc == 'number') {
      p.uniformLocsById[location] = webglLoc = GLctx.getUniformLocation(p, p.uniformArrayNamesById[location] + (webglLoc > 0 ? '[' + webglLoc + ']' : ''));
    }
    // Else an already cached WebGLUniformLocation, return it.
    return webglLoc;
  } else {
    GL.recordError(0x502/*GL_INVALID_OPERATION*/);
  }
}
/** @suppress{checkTypes} */
function emscriptenWebGLGetUniform(program, location, params, type) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if params == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  program = GL.programs[program];
  webglPrepareUniformLocationsBeforeFirstUse(program);
  var data = GLctx.getUniform(program, webglGetUniformLocation(location));
  if (typeof data == 'number' || typeof data == 'boolean') {
    switch (type) {
      case 0: HEAP32[((params) >> 2)] = data; break;
      case 2: HEAPF32[((params) >> 2)] = data; break;
    }
  } else {
    for (var i = 0; i < data.length; i++) {
      switch (type) {
        case 0: HEAP32[(((params) + (i * 4)) >> 2)] = data[i]; break;
        case 2: HEAPF32[(((params) + (i * 4)) >> 2)] = data[i]; break;
      }
    }
  }
}
function _emscripten_glGetUniformfv(program, location, params) {
  emscriptenWebGLGetUniform(program, location, params, 2);
}

function _emscripten_glGetUniformiv(program, location, params) {
  emscriptenWebGLGetUniform(program, location, params, 0);
}

function _emscripten_glGetVertexAttribPointerv(index, pname, pointer) {
  if (!pointer) {
    // GLES2 specification does not specify how to behave if pointer is a null pointer. Since calling this function does not make sense
    // if pointer == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((pointer) >> 2)] = GLctx.getVertexAttribOffset(index, pname);
}

/** @suppress{checkTypes} */
function emscriptenWebGLGetVertexAttrib(index, pname, params, type) {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if params == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var data = GLctx.getVertexAttrib(index, pname);
  if (pname == 0x889F/*VERTEX_ATTRIB_ARRAY_BUFFER_BINDING*/) {
    HEAP32[((params) >> 2)] = data && data["name"];
  } else if (typeof data == 'number' || typeof data == 'boolean') {
    switch (type) {
      case 0: HEAP32[((params) >> 2)] = data; break;
      case 2: HEAPF32[((params) >> 2)] = data; break;
      case 5: HEAP32[((params) >> 2)] = Math.fround(data); break;
    }
  } else {
    for (var i = 0; i < data.length; i++) {
      switch (type) {
        case 0: HEAP32[(((params) + (i * 4)) >> 2)] = data[i]; break;
        case 2: HEAPF32[(((params) + (i * 4)) >> 2)] = data[i]; break;
        case 5: HEAP32[(((params) + (i * 4)) >> 2)] = Math.fround(data[i]); break;
      }
    }
  }
}
function _emscripten_glGetVertexAttribfv(index, pname, params) {
  // N.B. This function may only be called if the vertex attribute was specified using the function glVertexAttrib*f(),
  // otherwise the results are undefined. (GLES3 spec 6.1.12)
  emscriptenWebGLGetVertexAttrib(index, pname, params, 2);
}

function _emscripten_glGetVertexAttribiv(index, pname, params) {
  // N.B. This function may only be called if the vertex attribute was specified using the function glVertexAttrib*f(),
  // otherwise the results are undefined. (GLES3 spec 6.1.12)
  emscriptenWebGLGetVertexAttrib(index, pname, params, 5);
}

function _emscripten_glHint(x0, x1) { GLctx['hint'](x0, x1) }

function _emscripten_glIsBuffer(buffer) {
  var b = GL.buffers[buffer];
  if (!b) return 0;
  return GLctx.isBuffer(b);
}

function _emscripten_glIsEnabled(x0) { return GLctx['isEnabled'](x0) }

function _emscripten_glIsFramebuffer(framebuffer) {
  var fb = GL.framebuffers[framebuffer];
  if (!fb) return 0;
  return GLctx.isFramebuffer(fb);
}

function _emscripten_glIsProgram(program) {
  program = GL.programs[program];
  if (!program) return 0;
  return GLctx.isProgram(program);
}

function _emscripten_glIsQueryEXT(id) {
  var query = GL.queries[id];
  if (!query) return 0;
  return GLctx.disjointTimerQueryExt['isQueryEXT'](query);
}

function _emscripten_glIsRenderbuffer(renderbuffer) {
  var rb = GL.renderbuffers[renderbuffer];
  if (!rb) return 0;
  return GLctx.isRenderbuffer(rb);
}

function _emscripten_glIsShader(shader) {
  var s = GL.shaders[shader];
  if (!s) return 0;
  return GLctx.isShader(s);
}

function _emscripten_glIsTexture(id) {
  var texture = GL.textures[id];
  if (!texture) return 0;
  return GLctx.isTexture(texture);
}

function _emscripten_glIsVertexArrayOES(array) {

  var vao = GL.vaos[array];
  if (!vao) return 0;
  return GLctx['isVertexArray'](vao);
}

function _emscripten_glLineWidth(x0) { GLctx['lineWidth'](x0) }

function _emscripten_glLinkProgram(program) {
  program = GL.programs[program];
  GLctx.linkProgram(program);
  // Invalidate earlier computed uniform->ID mappings, those have now become stale
  program.uniformLocsById = 0; // Mark as null-like so that glGetUniformLocation() knows to populate this again.
  program.uniformSizeAndIdsByName = {};

}

function _emscripten_glPixelStorei(pname, param) {
  if (pname == 0xCF5 /* GL_UNPACK_ALIGNMENT */) {
    GL.unpackAlignment = param;
  }
  GLctx.pixelStorei(pname, param);
}

function _emscripten_glPolygonOffset(x0, x1) { GLctx['polygonOffset'](x0, x1) }

function _emscripten_glQueryCounterEXT(id, target) {
  GLctx.disjointTimerQueryExt['queryCounterEXT'](GL.queries[id], target);
}

function computeUnpackAlignedImageSize(width, height, sizePerPixel, alignment) {
  function roundedToNextMultipleOf(x, y) {
    return (x + y - 1) & -y;
  }
  var plainRowSize = width * sizePerPixel;
  var alignedRowSize = roundedToNextMultipleOf(plainRowSize, alignment);
  return height * alignedRowSize;
}

function __colorChannelsInGlTextureFormat(format) {
  // Micro-optimizations for size: map format to size by subtracting smallest enum value (0x1902) from all values first.
  // Also omit the most common size value (1) from the list, which is assumed by formats not on the list.
  var colorChannels = {
    // 0x1902 /* GL_DEPTH_COMPONENT */ - 0x1902: 1,
    // 0x1906 /* GL_ALPHA */ - 0x1902: 1,
    5: 3,
    6: 4,
    // 0x1909 /* GL_LUMINANCE */ - 0x1902: 1,
    8: 2,
    29502: 3,
    29504: 4,
  };
  return colorChannels[format - 0x1902] || 1;
}

function heapObjectForWebGLType(type) {
  // Micro-optimization for size: Subtract lowest GL enum number (0x1400/* GL_BYTE */) from type to compare
  // smaller values for the heap, for shorter generated code size.
  // Also the type HEAPU16 is not tested for explicitly, but any unrecognized type will return out HEAPU16.
  // (since most types are HEAPU16)
  type -= 0x1400;

  if (type == 1) return HEAPU8;

  if (type == 4) return HEAP32;

  if (type == 6) return HEAPF32;

  if (type == 5
    || type == 28922
  )
    return HEAPU32;

  return HEAPU16;
}

function heapAccessShiftForWebGLHeap(heap) {
  return 31 - Math.clz32(heap.BYTES_PER_ELEMENT);
}
function emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) {
  var heap = heapObjectForWebGLType(type);
  var shift = heapAccessShiftForWebGLHeap(heap);
  var byteSize = 1 << shift;
  var sizePerPixel = __colorChannelsInGlTextureFormat(format) * byteSize;
  var bytes = computeUnpackAlignedImageSize(width, height, sizePerPixel, GL.unpackAlignment);
  return heap.subarray(pixels >> shift, pixels + bytes >> shift);
}
function _emscripten_glReadPixels(x, y, width, height, format, type, pixels) {
  var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
  if (!pixelData) {
    GL.recordError(0x500/*GL_INVALID_ENUM*/);
    return;
  }
  GLctx.readPixels(x, y, width, height, format, type, pixelData);
}

function _emscripten_glReleaseShaderCompiler() {
  // NOP (as allowed by GLES 2.0 spec)
}

function _emscripten_glRenderbufferStorage(x0, x1, x2, x3) { GLctx['renderbufferStorage'](x0, x1, x2, x3) }

function _emscripten_glSampleCoverage(value, invert) {
  GLctx.sampleCoverage(value, !!invert);
}

function _emscripten_glScissor(x0, x1, x2, x3) { GLctx['scissor'](x0, x1, x2, x3) }

function _emscripten_glShaderBinary() {
  GL.recordError(0x500/*GL_INVALID_ENUM*/);
}

function _emscripten_glShaderSource(shader, count, string, length) {
  var source = GL.getSource(shader, count, string, length);

  GLctx.shaderSource(GL.shaders[shader], source);
}

function _emscripten_glStencilFunc(x0, x1, x2) { GLctx['stencilFunc'](x0, x1, x2) }

function _emscripten_glStencilFuncSeparate(x0, x1, x2, x3) { GLctx['stencilFuncSeparate'](x0, x1, x2, x3) }

function _emscripten_glStencilMask(x0) { GLctx['stencilMask'](x0) }

function _emscripten_glStencilMaskSeparate(x0, x1) { GLctx['stencilMaskSeparate'](x0, x1) }

function _emscripten_glStencilOp(x0, x1, x2) { GLctx['stencilOp'](x0, x1, x2) }

function _emscripten_glStencilOpSeparate(x0, x1, x2, x3) { GLctx['stencilOpSeparate'](x0, x1, x2, x3) }

function _emscripten_glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
  GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null);
}

function _emscripten_glTexParameterf(x0, x1, x2) { GLctx['texParameterf'](x0, x1, x2) }

function _emscripten_glTexParameterfv(target, pname, params) {
  var param = HEAPF32[((params) >> 2)];
  GLctx.texParameterf(target, pname, param);
}

function _emscripten_glTexParameteri(x0, x1, x2) { GLctx['texParameteri'](x0, x1, x2) }

function _emscripten_glTexParameteriv(target, pname, params) {
  var param = HEAP32[((params) >> 2)];
  GLctx.texParameteri(target, pname, param);
}

function _emscripten_glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
  var pixelData = null;
  if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
  GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
}

function _emscripten_glUniform1f(location, v0) {
  GLctx.uniform1f(webglGetUniformLocation(location), v0);
}

var miniTempWebGLFloatBuffers = [];
function _emscripten_glUniform1fv(location, count, value) {

  if (count <= 288) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[count - 1];
    for (var i = 0; i < count; ++i) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 4) >> 2);
  }
  GLctx.uniform1fv(webglGetUniformLocation(location), view);
}

function _emscripten_glUniform1i(location, v0) {
  GLctx.uniform1i(webglGetUniformLocation(location), v0);
}

var __miniTempWebGLIntBuffers = [];
function _emscripten_glUniform1iv(location, count, value) {

  if (count <= 288) {
    // avoid allocation when uploading few enough uniforms
    var view = __miniTempWebGLIntBuffers[count - 1];
    for (var i = 0; i < count; ++i) {
      view[i] = HEAP32[(((value) + (4 * i)) >> 2)];
    }
  } else {
    var view = HEAP32.subarray((value) >> 2, (value + count * 4) >> 2);
  }
  GLctx.uniform1iv(webglGetUniformLocation(location), view);
}

function _emscripten_glUniform2f(location, v0, v1) {
  GLctx.uniform2f(webglGetUniformLocation(location), v0, v1);
}

function _emscripten_glUniform2fv(location, count, value) {

  if (count <= 144) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[2 * count - 1];
    for (var i = 0; i < 2 * count; i += 2) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAPF32[(((value) + (4 * i + 4)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 8) >> 2);
  }
  GLctx.uniform2fv(webglGetUniformLocation(location), view);
}

function _emscripten_glUniform2i(location, v0, v1) {
  GLctx.uniform2i(webglGetUniformLocation(location), v0, v1);
}

function _emscripten_glUniform2iv(location, count, value) {

  if (count <= 144) {
    // avoid allocation when uploading few enough uniforms
    var view = __miniTempWebGLIntBuffers[2 * count - 1];
    for (var i = 0; i < 2 * count; i += 2) {
      view[i] = HEAP32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAP32[(((value) + (4 * i + 4)) >> 2)];
    }
  } else {
    var view = HEAP32.subarray((value) >> 2, (value + count * 8) >> 2);
  }
  GLctx.uniform2iv(webglGetUniformLocation(location), view);
}

function _emscripten_glUniform3f(location, v0, v1, v2) {
  GLctx.uniform3f(webglGetUniformLocation(location), v0, v1, v2);
}

function _emscripten_glUniform3fv(location, count, value) {

  if (count <= 96) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[3 * count - 1];
    for (var i = 0; i < 3 * count; i += 3) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAPF32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAPF32[(((value) + (4 * i + 8)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 12) >> 2);
  }
  GLctx.uniform3fv(webglGetUniformLocation(location), view);
}

function _emscripten_glUniform3i(location, v0, v1, v2) {
  GLctx.uniform3i(webglGetUniformLocation(location), v0, v1, v2);
}

function _emscripten_glUniform3iv(location, count, value) {

  if (count <= 96) {
    // avoid allocation when uploading few enough uniforms
    var view = __miniTempWebGLIntBuffers[3 * count - 1];
    for (var i = 0; i < 3 * count; i += 3) {
      view[i] = HEAP32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAP32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAP32[(((value) + (4 * i + 8)) >> 2)];
    }
  } else {
    var view = HEAP32.subarray((value) >> 2, (value + count * 12) >> 2);
  }
  GLctx.uniform3iv(webglGetUniformLocation(location), view);
}

function _emscripten_glUniform4f(location, v0, v1, v2, v3) {
  GLctx.uniform4f(webglGetUniformLocation(location), v0, v1, v2, v3);
}

function _emscripten_glUniform4fv(location, count, value) {

  if (count <= 72) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[4 * count - 1];
    // hoist the heap out of the loop for size and for pthreads+growth.
    var heap = HEAPF32;
    value >>= 2;
    for (var i = 0; i < 4 * count; i += 4) {
      var dst = value + i;
      view[i] = heap[dst];
      view[i + 1] = heap[dst + 1];
      view[i + 2] = heap[dst + 2];
      view[i + 3] = heap[dst + 3];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 16) >> 2);
  }
  GLctx.uniform4fv(webglGetUniformLocation(location), view);
}

function _emscripten_glUniform4i(location, v0, v1, v2, v3) {
  GLctx.uniform4i(webglGetUniformLocation(location), v0, v1, v2, v3);
}

function _emscripten_glUniform4iv(location, count, value) {

  if (count <= 72) {
    // avoid allocation when uploading few enough uniforms
    var view = __miniTempWebGLIntBuffers[4 * count - 1];
    for (var i = 0; i < 4 * count; i += 4) {
      view[i] = HEAP32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAP32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAP32[(((value) + (4 * i + 8)) >> 2)];
      view[i + 3] = HEAP32[(((value) + (4 * i + 12)) >> 2)];
    }
  } else {
    var view = HEAP32.subarray((value) >> 2, (value + count * 16) >> 2);
  }
  GLctx.uniform4iv(webglGetUniformLocation(location), view);
}

function _emscripten_glUniformMatrix2fv(location, count, transpose, value) {

  if (count <= 72) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[4 * count - 1];
    for (var i = 0; i < 4 * count; i += 4) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAPF32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAPF32[(((value) + (4 * i + 8)) >> 2)];
      view[i + 3] = HEAPF32[(((value) + (4 * i + 12)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 16) >> 2);
  }
  GLctx.uniformMatrix2fv(webglGetUniformLocation(location), !!transpose, view);
}

function _emscripten_glUniformMatrix3fv(location, count, transpose, value) {

  if (count <= 32) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[9 * count - 1];
    for (var i = 0; i < 9 * count; i += 9) {
      view[i] = HEAPF32[(((value) + (4 * i)) >> 2)];
      view[i + 1] = HEAPF32[(((value) + (4 * i + 4)) >> 2)];
      view[i + 2] = HEAPF32[(((value) + (4 * i + 8)) >> 2)];
      view[i + 3] = HEAPF32[(((value) + (4 * i + 12)) >> 2)];
      view[i + 4] = HEAPF32[(((value) + (4 * i + 16)) >> 2)];
      view[i + 5] = HEAPF32[(((value) + (4 * i + 20)) >> 2)];
      view[i + 6] = HEAPF32[(((value) + (4 * i + 24)) >> 2)];
      view[i + 7] = HEAPF32[(((value) + (4 * i + 28)) >> 2)];
      view[i + 8] = HEAPF32[(((value) + (4 * i + 32)) >> 2)];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 36) >> 2);
  }
  GLctx.uniformMatrix3fv(webglGetUniformLocation(location), !!transpose, view);
}

function _emscripten_glUniformMatrix4fv(location, count, transpose, value) {

  if (count <= 18) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[16 * count - 1];
    // hoist the heap out of the loop for size and for pthreads+growth.
    var heap = HEAPF32;
    value >>= 2;
    for (var i = 0; i < 16 * count; i += 16) {
      var dst = value + i;
      view[i] = heap[dst];
      view[i + 1] = heap[dst + 1];
      view[i + 2] = heap[dst + 2];
      view[i + 3] = heap[dst + 3];
      view[i + 4] = heap[dst + 4];
      view[i + 5] = heap[dst + 5];
      view[i + 6] = heap[dst + 6];
      view[i + 7] = heap[dst + 7];
      view[i + 8] = heap[dst + 8];
      view[i + 9] = heap[dst + 9];
      view[i + 10] = heap[dst + 10];
      view[i + 11] = heap[dst + 11];
      view[i + 12] = heap[dst + 12];
      view[i + 13] = heap[dst + 13];
      view[i + 14] = heap[dst + 14];
      view[i + 15] = heap[dst + 15];
    }
  } else {
    var view = HEAPF32.subarray((value) >> 2, (value + count * 64) >> 2);
  }
  GLctx.uniformMatrix4fv(webglGetUniformLocation(location), !!transpose, view);
}

function _emscripten_glUseProgram(program) {
  program = GL.programs[program];
  GLctx.useProgram(program);
  // Record the currently active program so that we can access the uniform
  // mapping table of that program.
  GLctx.currentProgram = program;
}

function _emscripten_glValidateProgram(program) {
  GLctx.validateProgram(GL.programs[program]);
}

function _emscripten_glVertexAttrib1f(x0, x1) { GLctx['vertexAttrib1f'](x0, x1) }

function _emscripten_glVertexAttrib1fv(index, v) {

  GLctx.vertexAttrib1f(index, HEAPF32[v >> 2]);
}

function _emscripten_glVertexAttrib2f(x0, x1, x2) { GLctx['vertexAttrib2f'](x0, x1, x2) }

function _emscripten_glVertexAttrib2fv(index, v) {

  GLctx.vertexAttrib2f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2]);
}

function _emscripten_glVertexAttrib3f(x0, x1, x2, x3) { GLctx['vertexAttrib3f'](x0, x1, x2, x3) }

function _emscripten_glVertexAttrib3fv(index, v) {

  GLctx.vertexAttrib3f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2]);
}

function _emscripten_glVertexAttrib4f(x0, x1, x2, x3, x4) { GLctx['vertexAttrib4f'](x0, x1, x2, x3, x4) }

function _emscripten_glVertexAttrib4fv(index, v) {

  GLctx.vertexAttrib4f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2], HEAPF32[v + 12 >> 2]);
}

function _emscripten_glVertexAttribDivisorANGLE(index, divisor) {
  GLctx['vertexAttribDivisor'](index, divisor);
}

function _emscripten_glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
  GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
}

function _emscripten_glViewport(x0, x1, x2, x3) { GLctx['viewport'](x0, x1, x2, x3) }

function _emscripten_has_asyncify() {
  return 1;
}

function _emscripten_memcpy_big(dest, src, num) {
  HEAPU8.copyWithin(dest, src, src + num);
}

function doRequestFullscreen(target, strategy) {
  if (!JSEvents.fullscreenEnabled()) return -1;
  target = findEventTarget(target);
  if (!target) return -4;

  if (!target.requestFullscreen
    && !target.webkitRequestFullscreen
  ) {
    return -3;
  }

  var canPerformRequests = JSEvents.canPerformEventHandlerRequests();

  // Queue this function call if we're not currently in an event handler and the user saw it appropriate to do so.
  if (!canPerformRequests) {
    if (strategy.deferUntilInEventHandler) {
      JSEvents.deferCall(_JSEvents_requestFullscreen, 1 /* priority over pointer lock */, [target, strategy]);
      return 1;
    } else {
      return -2;
    }
  }

  return _JSEvents_requestFullscreen(target, strategy);
}
function _emscripten_request_fullscreen_strategy(target, deferUntilInEventHandler, fullscreenStrategy) {
  var strategy = {
    scaleMode: HEAP32[((fullscreenStrategy) >> 2)],
    canvasResolutionScaleMode: HEAP32[(((fullscreenStrategy) + (4)) >> 2)],
    filteringMode: HEAP32[(((fullscreenStrategy) + (8)) >> 2)],
    deferUntilInEventHandler: deferUntilInEventHandler,
    canvasResizedCallback: HEAP32[(((fullscreenStrategy) + (12)) >> 2)],
    canvasResizedCallbackUserData: HEAP32[(((fullscreenStrategy) + (16)) >> 2)]
  };

  return doRequestFullscreen(target, strategy);
}

function _emscripten_request_pointerlock(target, deferUntilInEventHandler) {
  target = findEventTarget(target);
  if (!target) return -4;
  if (!target.requestPointerLock
    && !target.msRequestPointerLock
  ) {
    return -1;
  }

  var canPerformRequests = JSEvents.canPerformEventHandlerRequests();

  // Queue this function call if we're not currently in an event handler and the user saw it appropriate to do so.
  if (!canPerformRequests) {
    if (deferUntilInEventHandler) {
      JSEvents.deferCall(requestPointerLock, 2 /* priority below fullscreen */, [target]);
      return 1;
    } else {
      return -2;
    }
  }

  return requestPointerLock(target);
}

function _emscripten_get_heap_max() {
  // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
  // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
  // for any code that deals with heap sizes, which would require special
  // casing all heap size related code to treat 0 specially.
  return 2147483648;
}

function emscripten_realloc_buffer(size) {
  try {
    // round size grow request up to wasm page size (fixed 64KB per spec)
    wasmMemory.grow((size - buffer.byteLength + 65535) >>> 16); // .grow() takes a delta compared to the previous size
    updateGlobalBufferAndViews(wasmMemory.buffer);
    return 1 /*success*/;
  } catch (e) {
    err('emscripten_realloc_buffer: Attempted to grow heap from ' + buffer.byteLength + ' bytes to ' + size + ' bytes, but got error: ' + e);
  }
  // implicit 0 return to save code size (caller will cast "undefined" into 0
  // anyhow)
}
function _emscripten_resize_heap(requestedSize) {
  var oldSize = HEAPU8.length;
  requestedSize = requestedSize >>> 0;
  // With pthreads, races can happen (another thread might increase the size
  // in between), so return a failure, and let the caller retry.
  assert(requestedSize > oldSize);

  // Memory resize rules:
  // 1.  Always increase heap size to at least the requested size, rounded up
  //     to next page multiple.
  // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
  //     geometrically: increase the heap size according to
  //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
  //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
  // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
  //     linearly: increase the heap size by at least
  //     MEMORY_GROWTH_LINEAR_STEP bytes.
  // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
  //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
  // 4.  If we were unable to allocate as much memory, it may be due to
  //     over-eager decision to excessively reserve due to (3) above.
  //     Hence if an allocation fails, cut down on the amount of excess
  //     growth, in an attempt to succeed to perform a smaller allocation.

  // A limit is set for how much we can grow. We should not exceed that
  // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
  var maxHeapSize = _emscripten_get_heap_max();
  if (requestedSize > maxHeapSize) {
    err('Cannot enlarge memory, asked to go up to ' + requestedSize + ' bytes, but the limit is ' + maxHeapSize + ' bytes!');
    return false;
  }

  // Loop through potential heap size increases. If we attempt a too eager
  // reservation that fails, cut down on the attempted size and reserve a
  // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
    var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
    // but limit overreserving (default to capping at +96MB overgrowth at most)
    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);

    var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));

    var replacement = emscripten_realloc_buffer(newSize);
    if (replacement) {

      return true;
    }
  }
  err('Failed to grow the heap from ' + oldSize + ' bytes to ' + newSize + ' bytes, not enough memory!');
  return false;
}

function _emscripten_sample_gamepad_data() {
  return (JSEvents.lastGamepadState = (navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : null)))
    ? 0 : -1;
}

function registerBeforeUnloadEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
  var beforeUnloadEventHandlerFunc = function (ev) {
    var e = ev || event;

    // Note: This is always called on the main browser thread, since it needs synchronously return a value!
    var confirmationMessage = (function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, 0, userData);

    if (confirmationMessage) {
      confirmationMessage = UTF8ToString(confirmationMessage);
    }
    if (confirmationMessage) {
      e.preventDefault();
      e.returnValue = confirmationMessage;
      return confirmationMessage;
    }
  };

  var eventHandler = {
    target: findEventTarget(target),
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: beforeUnloadEventHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_beforeunload_callback_on_thread(userData, callbackfunc, targetThread) {
  if (typeof onbeforeunload == 'undefined') return -1;
  // beforeunload callback can only be registered on the main browser thread, because the page will go away immediately after returning from the handler,
  // and there is no time to start proxying it anywhere.
  if (targetThread !== 1) return -5;
  registerBeforeUnloadEventCallback(2, userData, true, callbackfunc, 28, "beforeunload");
  return 0;
}

function registerFocusEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.focusEvent) JSEvents.focusEvent = _malloc(256);

  var focusEventHandlerFunc = function (ev) {
    var e = ev || event;

    var nodeName = JSEvents.getNodeNameForTarget(e.target);
    var id = e.target.id ? e.target.id : '';

    var focusEvent = JSEvents.focusEvent;
    stringToUTF8(nodeName, focusEvent + 0, 128);
    stringToUTF8(id, focusEvent + 128, 128);

    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, focusEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: findEventTarget(target),
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: focusEventHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_blur_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerFocusEventCallback(target, userData, useCapture, callbackfunc, 12, "blur", targetThread);
  return 0;
}


function _emscripten_set_element_css_size(target, width, height) {
  target = findEventTarget(target);
  if (!target) return -4;

  target.style.width = width + "px";
  target.style.height = height + "px";

  return 0;
}

function _emscripten_set_focus_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerFocusEventCallback(target, userData, useCapture, callbackfunc, 13, "focus", targetThread);
  return 0;
}

function fillFullscreenChangeEventData(eventStruct) {
  var fullscreenElement = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
  var isFullscreen = !!fullscreenElement;
  // Assigning a boolean to HEAP32 with expected type coercion.
  /** @suppress{checkTypes} */
  HEAP32[((eventStruct) >> 2)] = isFullscreen;
  HEAP32[(((eventStruct) + (4)) >> 2)] = JSEvents.fullscreenEnabled();
  // If transitioning to fullscreen, report info about the element that is now fullscreen.
  // If transitioning to windowed mode, report info about the element that just was fullscreen.
  var reportedElement = isFullscreen ? fullscreenElement : JSEvents.previousFullscreenElement;
  var nodeName = JSEvents.getNodeNameForTarget(reportedElement);
  var id = (reportedElement && reportedElement.id) ? reportedElement.id : '';
  stringToUTF8(nodeName, eventStruct + 8, 128);
  stringToUTF8(id, eventStruct + 136, 128);
  HEAP32[(((eventStruct) + (264)) >> 2)] = reportedElement ? reportedElement.clientWidth : 0;
  HEAP32[(((eventStruct) + (268)) >> 2)] = reportedElement ? reportedElement.clientHeight : 0;
  HEAP32[(((eventStruct) + (272)) >> 2)] = screen.width;
  HEAP32[(((eventStruct) + (276)) >> 2)] = screen.height;
  if (isFullscreen) {
    JSEvents.previousFullscreenElement = fullscreenElement;
  }
}
function registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.fullscreenChangeEvent) JSEvents.fullscreenChangeEvent = _malloc(280);

  var fullscreenChangeEventhandlerFunc = function (ev) {
    var e = ev || event;

    var fullscreenChangeEvent = JSEvents.fullscreenChangeEvent;

    fillFullscreenChangeEventData(fullscreenChangeEvent);

    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, fullscreenChangeEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: target,
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: fullscreenChangeEventhandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_fullscreenchange_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  if (!JSEvents.fullscreenEnabled()) return -1;
  target = findEventTarget(target);
  if (!target) return -4;
  registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "fullscreenchange", targetThread);

  // Unprefixed Fullscreen API shipped in Chromium 71 (https://bugs.chromium.org/p/chromium/issues/detail?id=383813)
  // As of Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitfullscreenchange. TODO: revisit this check once Safari ships unprefixed version.
  registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "webkitfullscreenchange", targetThread);

  return 0;
}

function registerGamepadEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.gamepadEvent) JSEvents.gamepadEvent = _malloc(1432);

  var gamepadEventHandlerFunc = function (ev) {
    var e = ev || event;

    var gamepadEvent = JSEvents.gamepadEvent;
    fillGamepadEventData(gamepadEvent, e["gamepad"]);

    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, gamepadEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: findEventTarget(target),
    allowsDeferredCalls: true,
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: gamepadEventHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_gamepadconnected_callback_on_thread(userData, useCapture, callbackfunc, targetThread) {
  if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
  registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 26, "gamepadconnected", targetThread);
  return 0;
}

function _emscripten_set_gamepaddisconnected_callback_on_thread(userData, useCapture, callbackfunc, targetThread) {
  if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
  registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 27, "gamepaddisconnected", targetThread);
  return 0;
}

function registerKeyEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.keyEvent) JSEvents.keyEvent = _malloc(176);

  var keyEventHandlerFunc = function (e) {
    assert(e);

    var keyEventData = JSEvents.keyEvent;
    HEAPF64[((keyEventData) >> 3)] = e.timeStamp;

    var idx = keyEventData >> 2;

    HEAP32[idx + 2] = e.location;
    HEAP32[idx + 3] = e.ctrlKey;
    HEAP32[idx + 4] = e.shiftKey;
    HEAP32[idx + 5] = e.altKey;
    HEAP32[idx + 6] = e.metaKey;
    HEAP32[idx + 7] = e.repeat;
    HEAP32[idx + 8] = e.charCode;
    HEAP32[idx + 9] = e.keyCode;
    HEAP32[idx + 10] = e.which;
    stringToUTF8(e.key || '', keyEventData + 44, 32);
    stringToUTF8(e.code || '', keyEventData + 76, 32);
    stringToUTF8(e.char || '', keyEventData + 108, 32);
    stringToUTF8(e.locale || '', keyEventData + 140, 32);

    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, keyEventData, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: findEventTarget(target),
    allowsDeferredCalls: true,
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: keyEventHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_keydown_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerKeyEventCallback(target, userData, useCapture, callbackfunc, 2, "keydown", targetThread);
  return 0;
}

function _emscripten_set_keypress_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerKeyEventCallback(target, userData, useCapture, callbackfunc, 1, "keypress", targetThread);
  return 0;
}

function _emscripten_set_keyup_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerKeyEventCallback(target, userData, useCapture, callbackfunc, 3, "keyup", targetThread);
  return 0;
}

function fillMouseEventData(eventStruct, e, target) {
  assert(eventStruct % 4 == 0);
  HEAPF64[((eventStruct) >> 3)] = e.timeStamp;
  var idx = eventStruct >> 2;
  HEAP32[idx + 2] = e.screenX;
  HEAP32[idx + 3] = e.screenY;
  HEAP32[idx + 4] = e.clientX;
  HEAP32[idx + 5] = e.clientY;
  HEAP32[idx + 6] = e.ctrlKey;
  HEAP32[idx + 7] = e.shiftKey;
  HEAP32[idx + 8] = e.altKey;
  HEAP32[idx + 9] = e.metaKey;
  HEAP16[idx * 2 + 20] = e.button;
  HEAP16[idx * 2 + 21] = e.buttons;

  HEAP32[idx + 11] = e["movementX"]
    ;

  HEAP32[idx + 12] = e["movementY"]
    ;

  var rect = getBoundingClientRect(target);
  HEAP32[idx + 13] = e.clientX - rect.left;
  HEAP32[idx + 14] = e.clientY - rect.top;

}
function registerMouseEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.mouseEvent) JSEvents.mouseEvent = _malloc(72);
  target = findEventTarget(target);

  var mouseEventHandlerFunc = function (ev) {
    var e = ev || event;

    // TODO: Make this access thread safe, or this could update live while app is reading it.
    fillMouseEventData(JSEvents.mouseEvent, e, target);

    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, JSEvents.mouseEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: target,
    allowsDeferredCalls: eventTypeString != 'mousemove' && eventTypeString != 'mouseenter' && eventTypeString != 'mouseleave', // Mouse move events do not allow fullscreen/pointer lock requests to be handled in them!
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: mouseEventHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_mousedown_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 5, "mousedown", targetThread);
  return 0;
}

function _emscripten_set_mouseenter_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 33, "mouseenter", targetThread);
  return 0;
}

function _emscripten_set_mouseleave_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 34, "mouseleave", targetThread);
  return 0;
}

function _emscripten_set_mousemove_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 8, "mousemove", targetThread);
  return 0;
}

function _emscripten_set_mouseup_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerMouseEventCallback(target, userData, useCapture, callbackfunc, 6, "mouseup", targetThread);
  return 0;
}

function fillPointerlockChangeEventData(eventStruct) {
  var pointerLockElement = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || document.msPointerLockElement;
  var isPointerlocked = !!pointerLockElement;
  // Assigning a boolean to HEAP32 with expected type coercion.
  /** @suppress{checkTypes} */
  HEAP32[((eventStruct) >> 2)] = isPointerlocked;
  var nodeName = JSEvents.getNodeNameForTarget(pointerLockElement);
  var id = (pointerLockElement && pointerLockElement.id) ? pointerLockElement.id : '';
  stringToUTF8(nodeName, eventStruct + 4, 128);
  stringToUTF8(id, eventStruct + 132, 128);
}
function registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.pointerlockChangeEvent) JSEvents.pointerlockChangeEvent = _malloc(260);

  var pointerlockChangeEventHandlerFunc = function (ev) {
    var e = ev || event;

    var pointerlockChangeEvent = JSEvents.pointerlockChangeEvent;
    fillPointerlockChangeEventData(pointerlockChangeEvent);

    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, pointerlockChangeEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: target,
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: pointerlockChangeEventHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
/** @suppress {missingProperties} */
function _emscripten_set_pointerlockchange_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  // TODO: Currently not supported in pthreads or in --proxy-to-worker mode. (In pthreads mode, document object is not defined)
  if (!document || !document.body || (!document.body.requestPointerLock && !document.body.mozRequestPointerLock && !document.body.webkitRequestPointerLock && !document.body.msRequestPointerLock)) {
    return -1;
  }

  target = findEventTarget(target);
  if (!target) return -4;
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "pointerlockchange", targetThread);
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mozpointerlockchange", targetThread);
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "webkitpointerlockchange", targetThread);
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mspointerlockchange", targetThread);
  return 0;
}

function registerUiEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.uiEvent) JSEvents.uiEvent = _malloc(36);

  target = findEventTarget(target);

  var uiEventHandlerFunc = function (ev) {
    var e = ev || event;
    if (e.target != target) {
      // Never take ui events such as scroll via a 'bubbled' route, but always from the direct element that
      // was targeted. Otherwise e.g. if app logs a message in response to a page scroll, the Emscripten log
      // message box could cause to scroll, generating a new (bubbled) scroll message, causing a new log print,
      // causing a new scroll, etc..
      return;
    }
    var b = document.body; // Take document.body to a variable, Closure compiler does not outline access to it on its own.
    if (!b) {
      // During a page unload 'body' can be null, with "Cannot read property 'clientWidth' of null" being thrown
      return;
    }
    var uiEvent = JSEvents.uiEvent;
    HEAP32[((uiEvent) >> 2)] = e.detail;
    HEAP32[(((uiEvent) + (4)) >> 2)] = b.clientWidth;
    HEAP32[(((uiEvent) + (8)) >> 2)] = b.clientHeight;
    HEAP32[(((uiEvent) + (12)) >> 2)] = innerWidth;
    HEAP32[(((uiEvent) + (16)) >> 2)] = innerHeight;
    HEAP32[(((uiEvent) + (20)) >> 2)] = outerWidth;
    HEAP32[(((uiEvent) + (24)) >> 2)] = outerHeight;
    HEAP32[(((uiEvent) + (28)) >> 2)] = pageXOffset;
    HEAP32[(((uiEvent) + (32)) >> 2)] = pageYOffset;
    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, uiEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: target,
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: uiEventHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_resize_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerUiEventCallback(target, userData, useCapture, callbackfunc, 10, "resize", targetThread);
  return 0;
}

function registerTouchEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.touchEvent) JSEvents.touchEvent = _malloc(1696);

  target = findEventTarget(target);

  var touchEventHandlerFunc = function (e) {
    assert(e);
    var t, touches = {}, et = e.touches;
    // To ease marshalling different kinds of touches that browser reports (all touches are listed in e.touches, 
    // only changed touches in e.changedTouches, and touches on target at a.targetTouches), mark a boolean in
    // each Touch object so that we can later loop only once over all touches we see to marshall over to Wasm.

    for (var i = 0; i < et.length; ++i) {
      t = et[i];
      // Browser might recycle the generated Touch objects between each frame (Firefox on Android), so reset any
      // changed/target states we may have set from previous frame.
      t.isChanged = t.onTarget = 0;
      touches[t.identifier] = t;
    }
    // Mark which touches are part of the changedTouches list.
    for (var i = 0; i < e.changedTouches.length; ++i) {
      t = e.changedTouches[i];
      t.isChanged = 1;
      touches[t.identifier] = t;
    }
    // Mark which touches are part of the targetTouches list.
    for (var i = 0; i < e.targetTouches.length; ++i) {
      touches[e.targetTouches[i].identifier].onTarget = 1;
    }

    var touchEvent = JSEvents.touchEvent;
    HEAPF64[((touchEvent) >> 3)] = e.timeStamp;
    var idx = touchEvent >> 2; // Pre-shift the ptr to index to HEAP32 to save code size
    HEAP32[idx + 3] = e.ctrlKey;
    HEAP32[idx + 4] = e.shiftKey;
    HEAP32[idx + 5] = e.altKey;
    HEAP32[idx + 6] = e.metaKey;
    idx += 7; // Advance to the start of the touch array.
    var targetRect = getBoundingClientRect(target);
    var numTouches = 0;
    for (var i in touches) {
      t = touches[i];
      HEAP32[idx + 0] = t.identifier;
      HEAP32[idx + 1] = t.screenX;
      HEAP32[idx + 2] = t.screenY;
      HEAP32[idx + 3] = t.clientX;
      HEAP32[idx + 4] = t.clientY;
      HEAP32[idx + 5] = t.pageX;
      HEAP32[idx + 6] = t.pageY;
      HEAP32[idx + 7] = t.isChanged;
      HEAP32[idx + 8] = t.onTarget;
      HEAP32[idx + 9] = t.clientX - targetRect.left;
      HEAP32[idx + 10] = t.clientY - targetRect.top;

      idx += 13;

      if (++numTouches > 31) {
        break;
      }
    }
    HEAP32[(((touchEvent) + (8)) >> 2)] = numTouches;

    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, touchEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: target,
    allowsDeferredCalls: eventTypeString == 'touchstart' || eventTypeString == 'touchend',
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: touchEventHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_touchcancel_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerTouchEventCallback(target, userData, useCapture, callbackfunc, 25, "touchcancel", targetThread);
  return 0;
}

function _emscripten_set_touchend_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerTouchEventCallback(target, userData, useCapture, callbackfunc, 23, "touchend", targetThread);
  return 0;
}

function _emscripten_set_touchmove_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerTouchEventCallback(target, userData, useCapture, callbackfunc, 24, "touchmove", targetThread);
  return 0;
}

function _emscripten_set_touchstart_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  registerTouchEventCallback(target, userData, useCapture, callbackfunc, 22, "touchstart", targetThread);
  return 0;
}

function fillVisibilityChangeEventData(eventStruct) {
  var visibilityStates = ["hidden", "visible", "prerender", "unloaded"];
  var visibilityState = visibilityStates.indexOf(document.visibilityState);

  // Assigning a boolean to HEAP32 with expected type coercion.
  /** @suppress{checkTypes} */
  HEAP32[((eventStruct) >> 2)] = document.hidden;
  HEAP32[(((eventStruct) + (4)) >> 2)] = visibilityState;
}
function registerVisibilityChangeEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.visibilityChangeEvent) JSEvents.visibilityChangeEvent = _malloc(8);

  var visibilityChangeEventHandlerFunc = function (ev) {
    var e = ev || event;

    var visibilityChangeEvent = JSEvents.visibilityChangeEvent;

    fillVisibilityChangeEventData(visibilityChangeEvent);

    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, visibilityChangeEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: target,
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: visibilityChangeEventHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_visibilitychange_callback_on_thread(userData, useCapture, callbackfunc, targetThread) {
  if (!specialHTMLTargets[1]) {
    return -4;
  }
  registerVisibilityChangeEventCallback(specialHTMLTargets[1], userData, useCapture, callbackfunc, 21, "visibilitychange", targetThread);
  return 0;
}

function registerWheelEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
  if (!JSEvents.wheelEvent) JSEvents.wheelEvent = _malloc(104);

  // The DOM Level 3 events spec event 'wheel'
  var wheelHandlerFunc = function (ev) {
    var e = ev || event;
    var wheelEvent = JSEvents.wheelEvent;
    fillMouseEventData(wheelEvent, e, target);
    HEAPF64[(((wheelEvent) + (72)) >> 3)] = e["deltaX"];
    HEAPF64[(((wheelEvent) + (80)) >> 3)] = e["deltaY"];
    HEAPF64[(((wheelEvent) + (88)) >> 3)] = e["deltaZ"];
    HEAP32[(((wheelEvent) + (96)) >> 2)] = e["deltaMode"];
    if ((function (a1, a2, a3) { return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]); })(eventTypeId, wheelEvent, userData)) e.preventDefault();
  };

  var eventHandler = {
    target: target,
    allowsDeferredCalls: true,
    eventTypeString: eventTypeString,
    callbackfunc: callbackfunc,
    handlerFunc: wheelHandlerFunc,
    useCapture: useCapture
  };
  JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_wheel_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  target = findEventTarget(target);
  if (typeof target.onwheel != 'undefined') {
    registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "wheel", targetThread);
    return 0;
  } else {
    return -1;
  }
}

function _emscripten_set_window_title(title) {
  setWindowTitle(AsciiToString(title));
}

function _emscripten_sleep(ms) {
  Asyncify.handleSleep((wakeUp) => safeSetTimeout(wakeUp, ms));
}

var ENV = {};

function getExecutableName() {
  return thisProgram || './this.program';
}
function getEnvStrings() {
  if (!getEnvStrings.strings) {
    // Default values.
    // Browser language detection #8751
    var lang = ((typeof navigator == 'object' && navigator.languages && navigator.languages[0]) || 'C').replace('-', '_') + '.UTF-8';
    var env = {
      'USER': 'web_user',
      'LOGNAME': 'web_user',
      'PATH': '/',
      'PWD': '/',
      'HOME': '/home/web_user',
      'LANG': lang,
      '_': getExecutableName()
    };
    // Apply the user-provided values, if any.
    for (var x in ENV) {
      // x is a key in ENV; if ENV[x] is undefined, that means it was
      // explicitly set to be so. We allow user code to do that to
      // force variables with default values to remain unset.
      if (ENV[x] === undefined) delete env[x];
      else env[x] = ENV[x];
    }
    var strings = [];
    for (var x in env) {
      strings.push(x + '=' + env[x]);
    }
    getEnvStrings.strings = strings;
  }
  return getEnvStrings.strings;
}
function _environ_get(__environ, environ_buf) {
  var bufSize = 0;
  getEnvStrings().forEach(function (string, i) {
    var ptr = environ_buf + bufSize;
    HEAP32[(((__environ) + (i * 4)) >> 2)] = ptr;
    writeAsciiToMemory(string, ptr);
    bufSize += string.length + 1;
  });
  return 0;
}

function _environ_sizes_get(penviron_count, penviron_buf_size) {
  var strings = getEnvStrings();
  HEAP32[((penviron_count) >> 2)] = strings.length;
  var bufSize = 0;
  strings.forEach(function (string) {
    bufSize += string.length + 1;
  });
  HEAP32[((penviron_buf_size) >> 2)] = bufSize;
  return 0;
}


function _fd_close(fd) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    FS.close(stream);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return e.errno;
  }
}

function _fd_fdstat_get(fd, pbuf) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    // All character devices are terminals (other things a Linux system would
    // assume is a character device, like the mouse, we have special APIs for).
    var type = stream.tty ? 2 :
      FS.isDir(stream.mode) ? 3 :
        FS.isLink(stream.mode) ? 7 :
          4;
    HEAP8[((pbuf) >> 0)] = type;
    // TODO HEAP16[(((pbuf)+(2))>>1)] = ?;
    // TODO (tempI64 = [?>>>0,(tempDouble=?,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math.min((+(Math.floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[(((pbuf)+(8))>>2)] = tempI64[0],HEAP32[(((pbuf)+(12))>>2)] = tempI64[1]);
    // TODO (tempI64 = [?>>>0,(tempDouble=?,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math.min((+(Math.floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[(((pbuf)+(16))>>2)] = tempI64[0],HEAP32[(((pbuf)+(20))>>2)] = tempI64[1]);
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return e.errno;
  }
}

function _fd_read(fd, iov, iovcnt, pnum) {
  try {

    var stream = SYSCALLS.getStreamFromFD(fd);
    var num = SYSCALLS.doReadv(stream, iov, iovcnt);
    HEAP32[((pnum) >> 2)] = num;
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return e.errno;
  }
}

function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
  try {


    var stream = SYSCALLS.getStreamFromFD(fd);
    var HIGH_OFFSET = 0x100000000; // 2^32
    // use an unsigned operator on low and shift high by 32-bits
    var offset = offset_high * HIGH_OFFSET + (offset_low >>> 0);

    var DOUBLE_LIMIT = 0x20000000000000; // 2^53
    // we also check for equality since DOUBLE_LIMIT + 1 == DOUBLE_LIMIT
    if (offset <= -DOUBLE_LIMIT || offset >= DOUBLE_LIMIT) {
      return -61;
    }

    FS.llseek(stream, offset, whence);
    (tempI64 = [stream.position >>> 0, (tempDouble = stream.position, (+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math.min((+(Math.floor((tempDouble) / 4294967296.0))), 4294967295.0)) | 0) >>> 0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble))) >>> 0)) / 4294967296.0))))) >>> 0) : 0)], HEAP32[((newOffset) >> 2)] = tempI64[0], HEAP32[(((newOffset) + (4)) >> 2)] = tempI64[1]);
    if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return e.errno;
  }
}

function _fd_write(fd, iov, iovcnt, pnum) {
  try {

    ;
    var stream = SYSCALLS.getStreamFromFD(fd);
    var num = SYSCALLS.doWritev(stream, iov, iovcnt);
    HEAP32[((pnum) >> 2)] = num;
    return 0;
  } catch (e) {
    if (typeof FS == 'undefined' || !(e instanceof FS.ErrnoError)) throw e;
    return e.errno;
  }
}

function getHostByName(name) {
  // generate hostent
  var ret = _malloc(20); // XXX possibly leaked, as are others here
  var nameBuf = _malloc(name.length + 1);
  stringToUTF8(name, nameBuf, name.length + 1);
  HEAP32[((ret) >> 2)] = nameBuf;
  var aliasesBuf = _malloc(4);
  HEAP32[((aliasesBuf) >> 2)] = 0;
  HEAP32[(((ret) + (4)) >> 2)] = aliasesBuf;
  var afinet = 2;
  HEAP32[(((ret) + (8)) >> 2)] = afinet;
  HEAP32[(((ret) + (12)) >> 2)] = 4;
  var addrListBuf = _malloc(12);
  HEAP32[((addrListBuf) >> 2)] = addrListBuf + 8;
  HEAP32[(((addrListBuf) + (4)) >> 2)] = 0;
  HEAP32[(((addrListBuf) + (8)) >> 2)] = inetPton4(DNS.lookup_name(name));
  HEAP32[(((ret) + (16)) >> 2)] = addrListBuf;
  return ret;
}
function _gethostbyname(name) {
  return getHostByName(UTF8ToString(name));
}

function _gettimeofday(ptr) {
  var now = Date.now();
  HEAP32[((ptr) >> 2)] = (now / 1000) | 0; // seconds
  HEAP32[(((ptr) + (4)) >> 2)] = ((now % 1000) * 1000) | 0; // microseconds
  return 0;
}

function _setTempRet0(val) {
  setTempRet0(val);
}

function _system(command) {
  if (ENVIRONMENT_IS_NODE) {
    if (!command) return 1; // shell is available

    var cmdstr = UTF8ToString(command);
    if (!cmdstr.length) return 0; // this is what glibc seems to do (shell works test?)

    var cp = require('child_process');
    var ret = cp.spawnSync(cmdstr, [], { shell: true, stdio: 'inherit' });

    var _W_EXITCODE = (ret, sig) => ((ret) << 8 | (sig));

    // this really only can happen if process is killed by signal
    if (ret.status === null) {
      // sadly node doesn't expose such function
      var signalToNumber = (sig) => {
        // implement only the most common ones, and fallback to SIGINT
        switch (sig) {
          case 'SIGHUP': return 1;
          case 'SIGINT': return 2;
          case 'SIGQUIT': return 3;
          case 'SIGFPE': return 8;
          case 'SIGKILL': return 9;
          case 'SIGALRM': return 14;
          case 'SIGTERM': return 15;
        }
        return 2; // SIGINT
      }
      return _W_EXITCODE(0, signalToNumber(ret.signal));
    }

    return _W_EXITCODE(ret.status, 0);
  }
  // int system(const char *command);
  // http://pubs.opengroup.org/onlinepubs/000095399/functions/system.html
  // Can't call external programs.
  if (!command) return 0; // no shell available
  setErrNo(52);
  return -1;
}

function _time(ptr) {
  ;
  var ret = (Date.now() / 1000) | 0;
  if (ptr) {
    HEAP32[((ptr) >> 2)] = ret;
  }
  return ret;
}


function runAndAbortIfError(func) {
  try {
    return func();
  } catch (e) {
    abort(e);
  }
}
var Asyncify = {
  State: { Normal: 0, Unwinding: 1, Rewinding: 2, Disabled: 3 }, state: 0, StackSize: 4096, currData: null, handleSleepReturnValue: 0, exportCallStack: [], callStackNameToId: {}, callStackIdToName: {}, callStackId: 0, asyncPromiseHandlers: null, sleepCallbacks: [], getCallStackId: function (funcName) {
    var id = Asyncify.callStackNameToId[funcName];
    if (id === undefined) {
      id = Asyncify.callStackId++;
      Asyncify.callStackNameToId[funcName] = id;
      Asyncify.callStackIdToName[id] = funcName;
    }
    return id;
  }, instrumentWasmImports: function (imports) {
    var ASYNCIFY_IMPORTS = ["env.invoke_*", "env.emscripten_sleep", "env.emscripten_wget", "env.emscripten_wget_data", "env.emscripten_idb_load", "env.emscripten_idb_store", "env.emscripten_idb_delete", "env.emscripten_idb_exists", "env.emscripten_idb_load_blob", "env.emscripten_idb_store_blob", "env.SDL_Delay", "env.emscripten_scan_registers", "env.emscripten_lazy_load_code", "env.emscripten_fiber_swap", "wasi_snapshot_preview1.fd_sync", "env.__wasi_fd_sync", "env._emval_await", "env._dlopen_js", "env.__asyncjs__*"].map((x) => x.split('.')[1]);
    for (var x in imports) {
      (function (x) {
        var original = imports[x];
        if (typeof original == 'function') {
          imports[x] = function () {
            var originalAsyncifyState = Asyncify.state;
            try {
              return original.apply(null, arguments);
            } finally {
              // Only asyncify-declared imports are allowed to change the
              // state.
              var isAsyncifyImport = ASYNCIFY_IMPORTS.indexOf(x) >= 0 ||
                x.startsWith('__asyncjs__');
              // Changing the state from normal to disabled is allowed (in any
              // function) as that is what shutdown does (and we don't have an
              // explicit list of shutdown imports).
              var changedToDisabled =
                originalAsyncifyState === Asyncify.State.Normal &&
                Asyncify.state === Asyncify.State.Disabled;
              // invoke_* functions are allowed to change the state if we do
              // not ignore indirect calls.
              var ignoredInvoke = x.startsWith('invoke_') &&
                true;
              if (Asyncify.state !== originalAsyncifyState &&
                !isAsyncifyImport &&
                !changedToDisabled &&
                !ignoredInvoke) {
                throw new Error('import ' + x + ' was not in ASYNCIFY_IMPORTS, but changed the state');
              }
            }
          }
        }
      })(x);
    }
  }, instrumentWasmExports: function (exports) {
    var ret = {};
    for (var x in exports) {
      (function (x) {
        var original = exports[x];
        if (typeof original == 'function') {
          ret[x] = function () {
            Asyncify.exportCallStack.push(x);
            try {
              return original.apply(null, arguments);
            } finally {
              if (!ABORT) {
                var y = Asyncify.exportCallStack.pop();
                assert(y === x);
                Asyncify.maybeStopUnwind();
              }
            }
          };
        } else {
          ret[x] = original;
        }
      })(x);
    }
    return ret;
  }, maybeStopUnwind: function () {
    if (Asyncify.currData &&
      Asyncify.state === Asyncify.State.Unwinding &&
      Asyncify.exportCallStack.length === 0) {
      // We just finished unwinding.

      Asyncify.state = Asyncify.State.Normal;
      // Keep the runtime alive so that a re-wind can be done later.
      runAndAbortIfError(Module['_asyncify_stop_unwind']);
      if (typeof Fibers != 'undefined') {
        Fibers.trampoline();
      }
    }
  }, whenDone: function () {
    assert(Asyncify.currData, 'Tried to wait for an async operation when none is in progress.');
    assert(!Asyncify.asyncPromiseHandlers, 'Cannot have multiple async operations in flight at once');
    return new Promise((resolve, reject) => {
      Asyncify.asyncPromiseHandlers = {
        resolve: resolve,
        reject: reject
      };
    });
  }, allocateData: function () {
    // An asyncify data structure has three fields:
    //  0  current stack pos
    //  4  max stack pos
    //  8  id of function at bottom of the call stack (callStackIdToName[id] == name of js function)
    //
    // The Asyncify ABI only interprets the first two fields, the rest is for the runtime.
    // We also embed a stack in the same memory region here, right next to the structure.
    // This struct is also defined as asyncify_data_t in emscripten/fiber.h
    var ptr = _malloc(12 + Asyncify.StackSize);
    Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize);
    Asyncify.setDataRewindFunc(ptr);
    return ptr;
  }, setDataHeader: function (ptr, stack, stackSize) {
    HEAP32[((ptr) >> 2)] = stack;
    HEAP32[(((ptr) + (4)) >> 2)] = stack + stackSize;
  }, setDataRewindFunc: function (ptr) {
    var bottomOfCallStack = Asyncify.exportCallStack[0];
    var rewindId = Asyncify.getCallStackId(bottomOfCallStack);
    HEAP32[(((ptr) + (8)) >> 2)] = rewindId;
  }, getDataRewindFunc: function (ptr) {
    var id = HEAP32[(((ptr) + (8)) >> 2)];
    var name = Asyncify.callStackIdToName[id];
    var func = Module['asm'][name];
    return func;
  }, doRewind: function (ptr) {
    var start = Asyncify.getDataRewindFunc(ptr);
    // Once we have rewound and the stack we no longer need to artificially keep
    // the runtime alive.

    return start();
  }, handleSleep: function (startAsync) {
    assert(Asyncify.state !== Asyncify.State.Disabled, 'Asyncify cannot be done during or after the runtime exits');
    if (ABORT) return;
    if (Asyncify.state === Asyncify.State.Normal) {
      // Prepare to sleep. Call startAsync, and see what happens:
      // if the code decided to call our callback synchronously,
      // then no async operation was in fact begun, and we don't
      // need to do anything.
      var reachedCallback = false;
      var reachedAfterCallback = false;
      startAsync((handleSleepReturnValue) => {
        assert(!handleSleepReturnValue || typeof handleSleepReturnValue == 'number' || typeof handleSleepReturnValue == 'boolean'); // old emterpretify API supported other stuff
        if (ABORT) return;
        Asyncify.handleSleepReturnValue = handleSleepReturnValue || 0;
        reachedCallback = true;
        if (!reachedAfterCallback) {
          // We are happening synchronously, so no need for async.
          return;
        }
        // This async operation did not happen synchronously, so we did
        // unwind. In that case there can be no compiled code on the stack,
        // as it might break later operations (we can rewind ok now, but if
        // we unwind again, we would unwind through the extra compiled code
        // too).
        assert(!Asyncify.exportCallStack.length, 'Waking up (starting to rewind) must be done from JS, without compiled code on the stack.');
        Asyncify.state = Asyncify.State.Rewinding;
        runAndAbortIfError(() => Module['_asyncify_start_rewind'](Asyncify.currData));
        if (typeof Browser != 'undefined' && Browser.mainLoop.func) {
          Browser.mainLoop.resume();
        }
        var asyncWasmReturnValue, isError = false;
        try {
          asyncWasmReturnValue = Asyncify.doRewind(Asyncify.currData);
        } catch (err) {
          asyncWasmReturnValue = err;
          isError = true;
        }
        // Track whether the return value was handled by any promise handlers.
        var handled = false;
        if (!Asyncify.currData) {
          // All asynchronous execution has finished.
          // `asyncWasmReturnValue` now contains the final
          // return value of the exported async WASM function.
          //
          // Note: `asyncWasmReturnValue` is distinct from
          // `Asyncify.handleSleepReturnValue`.
          // `Asyncify.handleSleepReturnValue` contains the return
          // value of the last C function to have executed
          // `Asyncify.handleSleep()`, where as `asyncWasmReturnValue`
          // contains the return value of the exported WASM function
          // that may have called C functions that
          // call `Asyncify.handleSleep()`.
          var asyncPromiseHandlers = Asyncify.asyncPromiseHandlers;
          if (asyncPromiseHandlers) {
            Asyncify.asyncPromiseHandlers = null;
            (isError ? asyncPromiseHandlers.reject : asyncPromiseHandlers.resolve)(asyncWasmReturnValue);
            handled = true;
          }
        }
        if (isError && !handled) {
          // If there was an error and it was not handled by now, we have no choice but to
          // rethrow that error into the global scope where it can be caught only by
          // `onerror` or `onunhandledpromiserejection`.
          throw asyncWasmReturnValue;
        }
      });
      reachedAfterCallback = true;
      if (!reachedCallback) {
        // A true async operation was begun; start a sleep.
        Asyncify.state = Asyncify.State.Unwinding;
        // TODO: reuse, don't alloc/free every sleep
        Asyncify.currData = Asyncify.allocateData();
        runAndAbortIfError(() => Module['_asyncify_start_unwind'](Asyncify.currData));
        if (typeof Browser != 'undefined' && Browser.mainLoop.func) {
          Browser.mainLoop.pause();
        }
      }
    } else if (Asyncify.state === Asyncify.State.Rewinding) {
      // Stop a resume.
      Asyncify.state = Asyncify.State.Normal;
      runAndAbortIfError(Module['_asyncify_stop_rewind']);
      _free(Asyncify.currData);
      Asyncify.currData = null;
      // Call all sleep callbacks now that the sleep-resume is all done.
      Asyncify.sleepCallbacks.forEach((func) => callUserCallback(func));
    } else {
      abort('invalid state: ' + Asyncify.state);
    }
    return Asyncify.handleSleepReturnValue;
  }, handleAsync: function (startAsync) {
    return Asyncify.handleSleep((wakeUp) => {
      // TODO: add error handling as a second param when handleSleep implements it.
      startAsync().then(wakeUp);
    });
  }
};

var FSNode = /** @constructor */ function (parent, name, mode, rdev) {
  if (!parent) {
    parent = this;  // root node sets parent to itself
  }
  this.parent = parent;
  this.mount = parent.mount;
  this.mounted = null;
  this.id = FS.nextInode++;
  this.name = name;
  this.mode = mode;
  this.node_ops = {};
  this.stream_ops = {};
  this.rdev = rdev;
};
var readMode = 292/*292*/ | 73/*73*/;
var writeMode = 146/*146*/;
Object.defineProperties(FSNode.prototype, {
  read: {
    get: /** @this{FSNode} */function () {
      return (this.mode & readMode) === readMode;
    },
    set: /** @this{FSNode} */function (val) {
      val ? this.mode |= readMode : this.mode &= ~readMode;
    }
  },
  write: {
    get: /** @this{FSNode} */function () {
      return (this.mode & writeMode) === writeMode;
    },
    set: /** @this{FSNode} */function (val) {
      val ? this.mode |= writeMode : this.mode &= ~writeMode;
    }
  },
  isFolder: {
    get: /** @this{FSNode} */function () {
      return FS.isDir(this.mode);
    }
  },
  isDevice: {
    get: /** @this{FSNode} */function () {
      return FS.isChrdev(this.mode);
    }
  }
});
FS.FSNode = FSNode;
FS.staticInit(); Module["FS_createPath"] = FS.createPath; Module["FS_createDataFile"] = FS.createDataFile; Module["FS_createPreloadedFile"] = FS.createPreloadedFile; Module["FS_createLazyFile"] = FS.createLazyFile; Module["FS_createDevice"] = FS.createDevice; Module["FS_unlink"] = FS.unlink;;
ERRNO_CODES = {
  'EPERM': 63,
  'ENOENT': 44,
  'ESRCH': 71,
  'EINTR': 27,
  'EIO': 29,
  'ENXIO': 60,
  'E2BIG': 1,
  'ENOEXEC': 45,
  'EBADF': 8,
  'ECHILD': 12,
  'EAGAIN': 6,
  'EWOULDBLOCK': 6,
  'ENOMEM': 48,
  'EACCES': 2,
  'EFAULT': 21,
  'ENOTBLK': 105,
  'EBUSY': 10,
  'EEXIST': 20,
  'EXDEV': 75,
  'ENODEV': 43,
  'ENOTDIR': 54,
  'EISDIR': 31,
  'EINVAL': 28,
  'ENFILE': 41,
  'EMFILE': 33,
  'ENOTTY': 59,
  'ETXTBSY': 74,
  'EFBIG': 22,
  'ENOSPC': 51,
  'ESPIPE': 70,
  'EROFS': 69,
  'EMLINK': 34,
  'EPIPE': 64,
  'EDOM': 18,
  'ERANGE': 68,
  'ENOMSG': 49,
  'EIDRM': 24,
  'ECHRNG': 106,
  'EL2NSYNC': 156,
  'EL3HLT': 107,
  'EL3RST': 108,
  'ELNRNG': 109,
  'EUNATCH': 110,
  'ENOCSI': 111,
  'EL2HLT': 112,
  'EDEADLK': 16,
  'ENOLCK': 46,
  'EBADE': 113,
  'EBADR': 114,
  'EXFULL': 115,
  'ENOANO': 104,
  'EBADRQC': 103,
  'EBADSLT': 102,
  'EDEADLOCK': 16,
  'EBFONT': 101,
  'ENOSTR': 100,
  'ENODATA': 116,
  'ETIME': 117,
  'ENOSR': 118,
  'ENONET': 119,
  'ENOPKG': 120,
  'EREMOTE': 121,
  'ENOLINK': 47,
  'EADV': 122,
  'ESRMNT': 123,
  'ECOMM': 124,
  'EPROTO': 65,
  'EMULTIHOP': 36,
  'EDOTDOT': 125,
  'EBADMSG': 9,
  'ENOTUNIQ': 126,
  'EBADFD': 127,
  'EREMCHG': 128,
  'ELIBACC': 129,
  'ELIBBAD': 130,
  'ELIBSCN': 131,
  'ELIBMAX': 132,
  'ELIBEXEC': 133,
  'ENOSYS': 52,
  'ENOTEMPTY': 55,
  'ENAMETOOLONG': 37,
  'ELOOP': 32,
  'EOPNOTSUPP': 138,
  'EPFNOSUPPORT': 139,
  'ECONNRESET': 15,
  'ENOBUFS': 42,
  'EAFNOSUPPORT': 5,
  'EPROTOTYPE': 67,
  'ENOTSOCK': 57,
  'ENOPROTOOPT': 50,
  'ESHUTDOWN': 140,
  'ECONNREFUSED': 14,
  'EADDRINUSE': 3,
  'ECONNABORTED': 13,
  'ENETUNREACH': 40,
  'ENETDOWN': 38,
  'ETIMEDOUT': 73,
  'EHOSTDOWN': 142,
  'EHOSTUNREACH': 23,
  'EINPROGRESS': 26,
  'EALREADY': 7,
  'EDESTADDRREQ': 17,
  'EMSGSIZE': 35,
  'EPROTONOSUPPORT': 66,
  'ESOCKTNOSUPPORT': 137,
  'EADDRNOTAVAIL': 4,
  'ENETRESET': 39,
  'EISCONN': 30,
  'ENOTCONN': 53,
  'ETOOMANYREFS': 141,
  'EUSERS': 136,
  'EDQUOT': 19,
  'ESTALE': 72,
  'ENOTSUP': 138,
  'ENOMEDIUM': 148,
  'EILSEQ': 25,
  'EOVERFLOW': 61,
  'ECANCELED': 11,
  'ENOTRECOVERABLE': 56,
  'EOWNERDEAD': 62,
  'ESTRPIPE': 135,
};;
Module["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas) { Browser.requestFullscreen(lockPointer, resizeCanvas) };
Module["requestFullScreen"] = function Module_requestFullScreen() { Browser.requestFullScreen() };
Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) { Browser.requestAnimationFrame(func) };
Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) { Browser.setCanvasSize(width, height, noUpdates) };
Module["pauseMainLoop"] = function Module_pauseMainLoop() { Browser.mainLoop.pause() };
Module["resumeMainLoop"] = function Module_resumeMainLoop() { Browser.mainLoop.resume() };
Module["getUserMedia"] = function Module_getUserMedia() { Browser.getUserMedia() }
Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) { return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes) };
var GLctx;;
for (var i = 0; i < 32; ++i) tempFixedLengthArray.push(new Array(i));;
var miniTempWebGLFloatBuffersStorage = new Float32Array(288);
for (/**@suppress{duplicate}*/var i = 0; i < 288; ++i) {
  miniTempWebGLFloatBuffers[i] = miniTempWebGLFloatBuffersStorage.subarray(0, i + 1);
}
;
var __miniTempWebGLIntBuffersStorage = new Int32Array(288);
for (/**@suppress{duplicate}*/var i = 0; i < 288; ++i) {
  __miniTempWebGLIntBuffers[i] = __miniTempWebGLIntBuffersStorage.subarray(0, i + 1);
}
;
var ASSERTIONS = true;



/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {string} input The string to decode.
 */
var decodeBase64 = typeof atob == 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE == 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf = Buffer.from(s, 'base64');
    return new Uint8Array(buf['buffer'], buf['byteOffset'], buf['byteLength']);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0; i < decoded.length; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}


var asmLibraryArg = {
  "__assert_fail": ___assert_fail,
  "__syscall__newselect": ___syscall__newselect,
  "__syscall_bind": ___syscall_bind,
  "__syscall_fcntl64": ___syscall_fcntl64,
  "__syscall_fstat64": ___syscall_fstat64,
  "__syscall_fstatat64": ___syscall_fstatat64,
  "__syscall_getdents64": ___syscall_getdents64,
  "__syscall_getsockname": ___syscall_getsockname,
  "__syscall_ioctl": ___syscall_ioctl,
  "__syscall_lstat64": ___syscall_lstat64,
  "__syscall_mkdir": ___syscall_mkdir,
  "__syscall_open": ___syscall_open,
  "__syscall_recvfrom": ___syscall_recvfrom,
  "__syscall_rename": ___syscall_rename,
  "__syscall_rmdir": ___syscall_rmdir,
  "__syscall_sendto": ___syscall_sendto,
  "__syscall_socket": ___syscall_socket,
  "__syscall_stat64": ___syscall_stat64,
  "__syscall_unlink": ___syscall_unlink,
  "clock_gettime": _clock_gettime,
  "eglBindAPI": _eglBindAPI,
  "eglChooseConfig": _eglChooseConfig,
  "eglCreateContext": _eglCreateContext,
  "eglCreateWindowSurface": _eglCreateWindowSurface,
  "eglDestroyContext": _eglDestroyContext,
  "eglDestroySurface": _eglDestroySurface,
  "eglGetConfigAttrib": _eglGetConfigAttrib,
  "eglGetDisplay": _eglGetDisplay,
  "eglGetError": _eglGetError,
  "eglInitialize": _eglInitialize,
  "eglMakeCurrent": _eglMakeCurrent,
  "eglQueryString": _eglQueryString,
  "eglSwapBuffers": _eglSwapBuffers,
  "eglSwapInterval": _eglSwapInterval,
  "eglTerminate": _eglTerminate,
  "eglWaitGL": _eglWaitGL,
  "eglWaitNative": _eglWaitNative,
  "emscripten_asm_const_int": _emscripten_asm_const_int,
  "emscripten_console_error": _emscripten_console_error,
  "emscripten_exit_fullscreen": _emscripten_exit_fullscreen,
  "emscripten_exit_pointerlock": _emscripten_exit_pointerlock,
  "emscripten_get_device_pixel_ratio": _emscripten_get_device_pixel_ratio,
  "emscripten_get_element_css_size": _emscripten_get_element_css_size,
  "emscripten_get_gamepad_status": _emscripten_get_gamepad_status,
  "emscripten_get_now": _emscripten_get_now,
  "emscripten_get_num_gamepads": _emscripten_get_num_gamepads,
  "emscripten_get_screen_size": _emscripten_get_screen_size,
  "emscripten_glActiveTexture": _emscripten_glActiveTexture,
  "emscripten_glAttachShader": _emscripten_glAttachShader,
  "emscripten_glBeginQueryEXT": _emscripten_glBeginQueryEXT,
  "emscripten_glBindAttribLocation": _emscripten_glBindAttribLocation,
  "emscripten_glBindBuffer": _emscripten_glBindBuffer,
  "emscripten_glBindFramebuffer": _emscripten_glBindFramebuffer,
  "emscripten_glBindRenderbuffer": _emscripten_glBindRenderbuffer,
  "emscripten_glBindTexture": _emscripten_glBindTexture,
  "emscripten_glBindVertexArrayOES": _emscripten_glBindVertexArrayOES,
  "emscripten_glBlendColor": _emscripten_glBlendColor,
  "emscripten_glBlendEquation": _emscripten_glBlendEquation,
  "emscripten_glBlendEquationSeparate": _emscripten_glBlendEquationSeparate,
  "emscripten_glBlendFunc": _emscripten_glBlendFunc,
  "emscripten_glBlendFuncSeparate": _emscripten_glBlendFuncSeparate,
  "emscripten_glBufferData": _emscripten_glBufferData,
  "emscripten_glBufferSubData": _emscripten_glBufferSubData,
  "emscripten_glCheckFramebufferStatus": _emscripten_glCheckFramebufferStatus,
  "emscripten_glClear": _emscripten_glClear,
  "emscripten_glClearColor": _emscripten_glClearColor,
  "emscripten_glClearDepthf": _emscripten_glClearDepthf,
  "emscripten_glClearStencil": _emscripten_glClearStencil,
  "emscripten_glColorMask": _emscripten_glColorMask,
  "emscripten_glCompileShader": _emscripten_glCompileShader,
  "emscripten_glCompressedTexImage2D": _emscripten_glCompressedTexImage2D,
  "emscripten_glCompressedTexSubImage2D": _emscripten_glCompressedTexSubImage2D,
  "emscripten_glCopyTexImage2D": _emscripten_glCopyTexImage2D,
  "emscripten_glCopyTexSubImage2D": _emscripten_glCopyTexSubImage2D,
  "emscripten_glCreateProgram": _emscripten_glCreateProgram,
  "emscripten_glCreateShader": _emscripten_glCreateShader,
  "emscripten_glCullFace": _emscripten_glCullFace,
  "emscripten_glDeleteBuffers": _emscripten_glDeleteBuffers,
  "emscripten_glDeleteFramebuffers": _emscripten_glDeleteFramebuffers,
  "emscripten_glDeleteProgram": _emscripten_glDeleteProgram,
  "emscripten_glDeleteQueriesEXT": _emscripten_glDeleteQueriesEXT,
  "emscripten_glDeleteRenderbuffers": _emscripten_glDeleteRenderbuffers,
  "emscripten_glDeleteShader": _emscripten_glDeleteShader,
  "emscripten_glDeleteTextures": _emscripten_glDeleteTextures,
  "emscripten_glDeleteVertexArraysOES": _emscripten_glDeleteVertexArraysOES,
  "emscripten_glDepthFunc": _emscripten_glDepthFunc,
  "emscripten_glDepthMask": _emscripten_glDepthMask,
  "emscripten_glDepthRangef": _emscripten_glDepthRangef,
  "emscripten_glDetachShader": _emscripten_glDetachShader,
  "emscripten_glDisable": _emscripten_glDisable,
  "emscripten_glDisableVertexAttribArray": _emscripten_glDisableVertexAttribArray,
  "emscripten_glDrawArrays": _emscripten_glDrawArrays,
  "emscripten_glDrawArraysInstancedANGLE": _emscripten_glDrawArraysInstancedANGLE,
  "emscripten_glDrawBuffersWEBGL": _emscripten_glDrawBuffersWEBGL,
  "emscripten_glDrawElements": _emscripten_glDrawElements,
  "emscripten_glDrawElementsInstancedANGLE": _emscripten_glDrawElementsInstancedANGLE,
  "emscripten_glEnable": _emscripten_glEnable,
  "emscripten_glEnableVertexAttribArray": _emscripten_glEnableVertexAttribArray,
  "emscripten_glEndQueryEXT": _emscripten_glEndQueryEXT,
  "emscripten_glFinish": _emscripten_glFinish,
  "emscripten_glFlush": _emscripten_glFlush,
  "emscripten_glFramebufferRenderbuffer": _emscripten_glFramebufferRenderbuffer,
  "emscripten_glFramebufferTexture2D": _emscripten_glFramebufferTexture2D,
  "emscripten_glFrontFace": _emscripten_glFrontFace,
  "emscripten_glGenBuffers": _emscripten_glGenBuffers,
  "emscripten_glGenFramebuffers": _emscripten_glGenFramebuffers,
  "emscripten_glGenQueriesEXT": _emscripten_glGenQueriesEXT,
  "emscripten_glGenRenderbuffers": _emscripten_glGenRenderbuffers,
  "emscripten_glGenTextures": _emscripten_glGenTextures,
  "emscripten_glGenVertexArraysOES": _emscripten_glGenVertexArraysOES,
  "emscripten_glGenerateMipmap": _emscripten_glGenerateMipmap,
  "emscripten_glGetActiveAttrib": _emscripten_glGetActiveAttrib,
  "emscripten_glGetActiveUniform": _emscripten_glGetActiveUniform,
  "emscripten_glGetAttachedShaders": _emscripten_glGetAttachedShaders,
  "emscripten_glGetAttribLocation": _emscripten_glGetAttribLocation,
  "emscripten_glGetBooleanv": _emscripten_glGetBooleanv,
  "emscripten_glGetBufferParameteriv": _emscripten_glGetBufferParameteriv,
  "emscripten_glGetError": _emscripten_glGetError,
  "emscripten_glGetFloatv": _emscripten_glGetFloatv,
  "emscripten_glGetFramebufferAttachmentParameteriv": _emscripten_glGetFramebufferAttachmentParameteriv,
  "emscripten_glGetIntegerv": _emscripten_glGetIntegerv,
  "emscripten_glGetProgramInfoLog": _emscripten_glGetProgramInfoLog,
  "emscripten_glGetProgramiv": _emscripten_glGetProgramiv,
  "emscripten_glGetQueryObjecti64vEXT": _emscripten_glGetQueryObjecti64vEXT,
  "emscripten_glGetQueryObjectivEXT": _emscripten_glGetQueryObjectivEXT,
  "emscripten_glGetQueryObjectui64vEXT": _emscripten_glGetQueryObjectui64vEXT,
  "emscripten_glGetQueryObjectuivEXT": _emscripten_glGetQueryObjectuivEXT,
  "emscripten_glGetQueryivEXT": _emscripten_glGetQueryivEXT,
  "emscripten_glGetRenderbufferParameteriv": _emscripten_glGetRenderbufferParameteriv,
  "emscripten_glGetShaderInfoLog": _emscripten_glGetShaderInfoLog,
  "emscripten_glGetShaderPrecisionFormat": _emscripten_glGetShaderPrecisionFormat,
  "emscripten_glGetShaderSource": _emscripten_glGetShaderSource,
  "emscripten_glGetShaderiv": _emscripten_glGetShaderiv,
  "emscripten_glGetString": _emscripten_glGetString,
  "emscripten_glGetTexParameterfv": _emscripten_glGetTexParameterfv,
  "emscripten_glGetTexParameteriv": _emscripten_glGetTexParameteriv,
  "emscripten_glGetUniformLocation": _emscripten_glGetUniformLocation,
  "emscripten_glGetUniformfv": _emscripten_glGetUniformfv,
  "emscripten_glGetUniformiv": _emscripten_glGetUniformiv,
  "emscripten_glGetVertexAttribPointerv": _emscripten_glGetVertexAttribPointerv,
  "emscripten_glGetVertexAttribfv": _emscripten_glGetVertexAttribfv,
  "emscripten_glGetVertexAttribiv": _emscripten_glGetVertexAttribiv,
  "emscripten_glHint": _emscripten_glHint,
  "emscripten_glIsBuffer": _emscripten_glIsBuffer,
  "emscripten_glIsEnabled": _emscripten_glIsEnabled,
  "emscripten_glIsFramebuffer": _emscripten_glIsFramebuffer,
  "emscripten_glIsProgram": _emscripten_glIsProgram,
  "emscripten_glIsQueryEXT": _emscripten_glIsQueryEXT,
  "emscripten_glIsRenderbuffer": _emscripten_glIsRenderbuffer,
  "emscripten_glIsShader": _emscripten_glIsShader,
  "emscripten_glIsTexture": _emscripten_glIsTexture,
  "emscripten_glIsVertexArrayOES": _emscripten_glIsVertexArrayOES,
  "emscripten_glLineWidth": _emscripten_glLineWidth,
  "emscripten_glLinkProgram": _emscripten_glLinkProgram,
  "emscripten_glPixelStorei": _emscripten_glPixelStorei,
  "emscripten_glPolygonOffset": _emscripten_glPolygonOffset,
  "emscripten_glQueryCounterEXT": _emscripten_glQueryCounterEXT,
  "emscripten_glReadPixels": _emscripten_glReadPixels,
  "emscripten_glReleaseShaderCompiler": _emscripten_glReleaseShaderCompiler,
  "emscripten_glRenderbufferStorage": _emscripten_glRenderbufferStorage,
  "emscripten_glSampleCoverage": _emscripten_glSampleCoverage,
  "emscripten_glScissor": _emscripten_glScissor,
  "emscripten_glShaderBinary": _emscripten_glShaderBinary,
  "emscripten_glShaderSource": _emscripten_glShaderSource,
  "emscripten_glStencilFunc": _emscripten_glStencilFunc,
  "emscripten_glStencilFuncSeparate": _emscripten_glStencilFuncSeparate,
  "emscripten_glStencilMask": _emscripten_glStencilMask,
  "emscripten_glStencilMaskSeparate": _emscripten_glStencilMaskSeparate,
  "emscripten_glStencilOp": _emscripten_glStencilOp,
  "emscripten_glStencilOpSeparate": _emscripten_glStencilOpSeparate,
  "emscripten_glTexImage2D": _emscripten_glTexImage2D,
  "emscripten_glTexParameterf": _emscripten_glTexParameterf,
  "emscripten_glTexParameterfv": _emscripten_glTexParameterfv,
  "emscripten_glTexParameteri": _emscripten_glTexParameteri,
  "emscripten_glTexParameteriv": _emscripten_glTexParameteriv,
  "emscripten_glTexSubImage2D": _emscripten_glTexSubImage2D,
  "emscripten_glUniform1f": _emscripten_glUniform1f,
  "emscripten_glUniform1fv": _emscripten_glUniform1fv,
  "emscripten_glUniform1i": _emscripten_glUniform1i,
  "emscripten_glUniform1iv": _emscripten_glUniform1iv,
  "emscripten_glUniform2f": _emscripten_glUniform2f,
  "emscripten_glUniform2fv": _emscripten_glUniform2fv,
  "emscripten_glUniform2i": _emscripten_glUniform2i,
  "emscripten_glUniform2iv": _emscripten_glUniform2iv,
  "emscripten_glUniform3f": _emscripten_glUniform3f,
  "emscripten_glUniform3fv": _emscripten_glUniform3fv,
  "emscripten_glUniform3i": _emscripten_glUniform3i,
  "emscripten_glUniform3iv": _emscripten_glUniform3iv,
  "emscripten_glUniform4f": _emscripten_glUniform4f,
  "emscripten_glUniform4fv": _emscripten_glUniform4fv,
  "emscripten_glUniform4i": _emscripten_glUniform4i,
  "emscripten_glUniform4iv": _emscripten_glUniform4iv,
  "emscripten_glUniformMatrix2fv": _emscripten_glUniformMatrix2fv,
  "emscripten_glUniformMatrix3fv": _emscripten_glUniformMatrix3fv,
  "emscripten_glUniformMatrix4fv": _emscripten_glUniformMatrix4fv,
  "emscripten_glUseProgram": _emscripten_glUseProgram,
  "emscripten_glValidateProgram": _emscripten_glValidateProgram,
  "emscripten_glVertexAttrib1f": _emscripten_glVertexAttrib1f,
  "emscripten_glVertexAttrib1fv": _emscripten_glVertexAttrib1fv,
  "emscripten_glVertexAttrib2f": _emscripten_glVertexAttrib2f,
  "emscripten_glVertexAttrib2fv": _emscripten_glVertexAttrib2fv,
  "emscripten_glVertexAttrib3f": _emscripten_glVertexAttrib3f,
  "emscripten_glVertexAttrib3fv": _emscripten_glVertexAttrib3fv,
  "emscripten_glVertexAttrib4f": _emscripten_glVertexAttrib4f,
  "emscripten_glVertexAttrib4fv": _emscripten_glVertexAttrib4fv,
  "emscripten_glVertexAttribDivisorANGLE": _emscripten_glVertexAttribDivisorANGLE,
  "emscripten_glVertexAttribPointer": _emscripten_glVertexAttribPointer,
  "emscripten_glViewport": _emscripten_glViewport,
  "emscripten_has_asyncify": _emscripten_has_asyncify,
  "emscripten_memcpy_big": _emscripten_memcpy_big,
  "emscripten_request_fullscreen_strategy": _emscripten_request_fullscreen_strategy,
  "emscripten_request_pointerlock": _emscripten_request_pointerlock,
  "emscripten_resize_heap": _emscripten_resize_heap,
  "emscripten_sample_gamepad_data": _emscripten_sample_gamepad_data,
  "emscripten_set_beforeunload_callback_on_thread": _emscripten_set_beforeunload_callback_on_thread,
  "emscripten_set_blur_callback_on_thread": _emscripten_set_blur_callback_on_thread,
  "emscripten_set_canvas_element_size": _emscripten_set_canvas_element_size,
  "emscripten_set_element_css_size": _emscripten_set_element_css_size,
  "emscripten_set_focus_callback_on_thread": _emscripten_set_focus_callback_on_thread,
  "emscripten_set_fullscreenchange_callback_on_thread": _emscripten_set_fullscreenchange_callback_on_thread,
  "emscripten_set_gamepadconnected_callback_on_thread": _emscripten_set_gamepadconnected_callback_on_thread,
  "emscripten_set_gamepaddisconnected_callback_on_thread": _emscripten_set_gamepaddisconnected_callback_on_thread,
  "emscripten_set_keydown_callback_on_thread": _emscripten_set_keydown_callback_on_thread,
  "emscripten_set_keypress_callback_on_thread": _emscripten_set_keypress_callback_on_thread,
  "emscripten_set_keyup_callback_on_thread": _emscripten_set_keyup_callback_on_thread,
  "emscripten_set_mousedown_callback_on_thread": _emscripten_set_mousedown_callback_on_thread,
  "emscripten_set_mouseenter_callback_on_thread": _emscripten_set_mouseenter_callback_on_thread,
  "emscripten_set_mouseleave_callback_on_thread": _emscripten_set_mouseleave_callback_on_thread,
  "emscripten_set_mousemove_callback_on_thread": _emscripten_set_mousemove_callback_on_thread,
  "emscripten_set_mouseup_callback_on_thread": _emscripten_set_mouseup_callback_on_thread,
  "emscripten_set_pointerlockchange_callback_on_thread": _emscripten_set_pointerlockchange_callback_on_thread,
  "emscripten_set_resize_callback_on_thread": _emscripten_set_resize_callback_on_thread,
  "emscripten_set_touchcancel_callback_on_thread": _emscripten_set_touchcancel_callback_on_thread,
  "emscripten_set_touchend_callback_on_thread": _emscripten_set_touchend_callback_on_thread,
  "emscripten_set_touchmove_callback_on_thread": _emscripten_set_touchmove_callback_on_thread,
  "emscripten_set_touchstart_callback_on_thread": _emscripten_set_touchstart_callback_on_thread,
  "emscripten_set_visibilitychange_callback_on_thread": _emscripten_set_visibilitychange_callback_on_thread,
  "emscripten_set_wheel_callback_on_thread": _emscripten_set_wheel_callback_on_thread,
  "emscripten_set_window_title": _emscripten_set_window_title,
  "emscripten_sleep": _emscripten_sleep,
  "environ_get": _environ_get,
  "environ_sizes_get": _environ_sizes_get,
  "exit": _exit,
  "fd_close": _fd_close,
  "fd_fdstat_get": _fd_fdstat_get,
  "fd_read": _fd_read,
  "fd_seek": _fd_seek,
  "fd_write": _fd_write,
  "gethostbyname": _gethostbyname,
  "gettimeofday": _gettimeofday,
  "setTempRet0": _setTempRet0,
  "system": _system,
  "time": _time
};
Asyncify.instrumentWasmImports(asmLibraryArg);
var asm = createWasm();
/** @type {function(...*):?} */
var ___wasm_call_ctors = Module["___wasm_call_ctors"] = createExportWrapper("__wasm_call_ctors");

/** @type {function(...*):?} */
var _main = Module["_main"] = createExportWrapper("main");

/** @type {function(...*):?} */
var _malloc = Module["_malloc"] = createExportWrapper("malloc");

/** @type {function(...*):?} */
var _free = Module["_free"] = createExportWrapper("free");

/** @type {function(...*):?} */
var ___errno_location = Module["___errno_location"] = createExportWrapper("__errno_location");

/** @type {function(...*):?} */
var _memcpy = Module["_memcpy"] = createExportWrapper("memcpy");

/** @type {function(...*):?} */
var ___stdio_exit = Module["___stdio_exit"] = createExportWrapper("__stdio_exit");

/** @type {function(...*):?} */
var ___dl_seterr = Module["___dl_seterr"] = createExportWrapper("__dl_seterr");

/** @type {function(...*):?} */
var _htons = Module["_htons"] = createExportWrapper("htons");

/** @type {function(...*):?} */
var _ntohs = Module["_ntohs"] = createExportWrapper("ntohs");

/** @type {function(...*):?} */
var _emscripten_stack_init = Module["_emscripten_stack_init"] = function () {
  return (_emscripten_stack_init = Module["_emscripten_stack_init"] = Module["asm"]["emscripten_stack_init"]).apply(null, arguments);
};

/** @type {function(...*):?} */
var _emscripten_stack_set_limits = Module["_emscripten_stack_set_limits"] = function () {
  return (_emscripten_stack_set_limits = Module["_emscripten_stack_set_limits"] = Module["asm"]["emscripten_stack_set_limits"]).apply(null, arguments);
};

/** @type {function(...*):?} */
var _emscripten_stack_get_free = Module["_emscripten_stack_get_free"] = function () {
  return (_emscripten_stack_get_free = Module["_emscripten_stack_get_free"] = Module["asm"]["emscripten_stack_get_free"]).apply(null, arguments);
};

/** @type {function(...*):?} */
var _emscripten_stack_get_base = Module["_emscripten_stack_get_base"] = function () {
  return (_emscripten_stack_get_base = Module["_emscripten_stack_get_base"] = Module["asm"]["emscripten_stack_get_base"]).apply(null, arguments);
};

/** @type {function(...*):?} */
var _emscripten_stack_get_end = Module["_emscripten_stack_get_end"] = function () {
  return (_emscripten_stack_get_end = Module["_emscripten_stack_get_end"] = Module["asm"]["emscripten_stack_get_end"]).apply(null, arguments);
};

/** @type {function(...*):?} */
var stackSave = Module["stackSave"] = createExportWrapper("stackSave");

/** @type {function(...*):?} */
var stackRestore = Module["stackRestore"] = createExportWrapper("stackRestore");

/** @type {function(...*):?} */
var stackAlloc = Module["stackAlloc"] = createExportWrapper("stackAlloc");

/** @type {function(...*):?} */
var dynCall_v = Module["dynCall_v"] = createExportWrapper("dynCall_v");

/** @type {function(...*):?} */
var dynCall_viiii = Module["dynCall_viiii"] = createExportWrapper("dynCall_viiii");

/** @type {function(...*):?} */
var dynCall_i = Module["dynCall_i"] = createExportWrapper("dynCall_i");

/** @type {function(...*):?} */
var dynCall_vi = Module["dynCall_vi"] = createExportWrapper("dynCall_vi");

/** @type {function(...*):?} */
var dynCall_iii = Module["dynCall_iii"] = createExportWrapper("dynCall_iii");

/** @type {function(...*):?} */
var dynCall_vii = Module["dynCall_vii"] = createExportWrapper("dynCall_vii");

/** @type {function(...*):?} */
var dynCall_ii = Module["dynCall_ii"] = createExportWrapper("dynCall_ii");

/** @type {function(...*):?} */
var dynCall_viii = Module["dynCall_viii"] = createExportWrapper("dynCall_viii");

/** @type {function(...*):?} */
var dynCall_iiiiii = Module["dynCall_iiiiii"] = createExportWrapper("dynCall_iiiiii");

/** @type {function(...*):?} */
var dynCall_iiiii = Module["dynCall_iiiii"] = createExportWrapper("dynCall_iiiii");

/** @type {function(...*):?} */
var dynCall_iiii = Module["dynCall_iiii"] = createExportWrapper("dynCall_iiii");

/** @type {function(...*):?} */
var dynCall_vjii = Module["dynCall_vjii"] = createExportWrapper("dynCall_vjii");

/** @type {function(...*):?} */
var dynCall_vf = Module["dynCall_vf"] = createExportWrapper("dynCall_vf");

/** @type {function(...*):?} */
var dynCall_iiji = Module["dynCall_iiji"] = createExportWrapper("dynCall_iiji");

/** @type {function(...*):?} */
var dynCall_iid = Module["dynCall_iid"] = createExportWrapper("dynCall_iid");

/** @type {function(...*):?} */
var dynCall_viiiii = Module["dynCall_viiiii"] = createExportWrapper("dynCall_viiiii");

/** @type {function(...*):?} */
var dynCall_iiiiiiii = Module["dynCall_iiiiiiii"] = createExportWrapper("dynCall_iiiiiiii");

/** @type {function(...*):?} */
var dynCall_iiiiiiiiii = Module["dynCall_iiiiiiiiii"] = createExportWrapper("dynCall_iiiiiiiiii");

/** @type {function(...*):?} */
var dynCall_iiiiiiiiiiiiiiff = Module["dynCall_iiiiiiiiiiiiiiff"] = createExportWrapper("dynCall_iiiiiiiiiiiiiiff");

/** @type {function(...*):?} */
var dynCall_iiiiiiiii = Module["dynCall_iiiiiiiii"] = createExportWrapper("dynCall_iiiiiiiii");

/** @type {function(...*):?} */
var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = createExportWrapper("dynCall_viiiiiii");

/** @type {function(...*):?} */
var dynCall_viiiiiiiiiii = Module["dynCall_viiiiiiiiiii"] = createExportWrapper("dynCall_viiiiiiiiiii");

/** @type {function(...*):?} */
var dynCall_iiiiiidii = Module["dynCall_iiiiiidii"] = createExportWrapper("dynCall_iiiiiidii");

/** @type {function(...*):?} */
var dynCall_jiji = Module["dynCall_jiji"] = createExportWrapper("dynCall_jiji");

/** @type {function(...*):?} */
var dynCall_ji = Module["dynCall_ji"] = createExportWrapper("dynCall_ji");

/** @type {function(...*):?} */
var dynCall_vffff = Module["dynCall_vffff"] = createExportWrapper("dynCall_vffff");

/** @type {function(...*):?} */
var dynCall_viiiiiiii = Module["dynCall_viiiiiiii"] = createExportWrapper("dynCall_viiiiiiii");

/** @type {function(...*):?} */
var dynCall_viiiiiiiii = Module["dynCall_viiiiiiiii"] = createExportWrapper("dynCall_viiiiiiiii");

/** @type {function(...*):?} */
var dynCall_vff = Module["dynCall_vff"] = createExportWrapper("dynCall_vff");

/** @type {function(...*):?} */
var dynCall_vfi = Module["dynCall_vfi"] = createExportWrapper("dynCall_vfi");

/** @type {function(...*):?} */
var dynCall_viif = Module["dynCall_viif"] = createExportWrapper("dynCall_viif");

/** @type {function(...*):?} */
var dynCall_vif = Module["dynCall_vif"] = createExportWrapper("dynCall_vif");

/** @type {function(...*):?} */
var dynCall_viff = Module["dynCall_viff"] = createExportWrapper("dynCall_viff");

/** @type {function(...*):?} */
var dynCall_vifff = Module["dynCall_vifff"] = createExportWrapper("dynCall_vifff");

/** @type {function(...*):?} */
var dynCall_viffff = Module["dynCall_viffff"] = createExportWrapper("dynCall_viffff");

/** @type {function(...*):?} */
var dynCall_viiiiii = Module["dynCall_viiiiii"] = createExportWrapper("dynCall_viiiiii");

/** @type {function(...*):?} */
var dynCall_iidiiii = Module["dynCall_iidiiii"] = createExportWrapper("dynCall_iidiiii");

/** @type {function(...*):?} */
var _asyncify_start_unwind = Module["_asyncify_start_unwind"] = createExportWrapper("asyncify_start_unwind");

/** @type {function(...*):?} */
var _asyncify_stop_unwind = Module["_asyncify_stop_unwind"] = createExportWrapper("asyncify_stop_unwind");

/** @type {function(...*):?} */
var _asyncify_start_rewind = Module["_asyncify_start_rewind"] = createExportWrapper("asyncify_start_rewind");

/** @type {function(...*):?} */
var _asyncify_stop_rewind = Module["_asyncify_stop_rewind"] = createExportWrapper("asyncify_stop_rewind");





// === Auto-generated postamble setup entry stuff ===

if (!Object.getOwnPropertyDescriptor(Module, "intArrayFromString")) Module["intArrayFromString"] = () => abort("'intArrayFromString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "intArrayToString")) Module["intArrayToString"] = () => abort("'intArrayToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;
if (!Object.getOwnPropertyDescriptor(Module, "setValue")) Module["setValue"] = () => abort("'setValue' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getValue")) Module["getValue"] = () => abort("'getValue' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "allocate")) Module["allocate"] = () => abort("'allocate' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "UTF8ArrayToString")) Module["UTF8ArrayToString"] = () => abort("'UTF8ArrayToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "UTF8ToString")) Module["UTF8ToString"] = () => abort("'UTF8ToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF8Array")) Module["stringToUTF8Array"] = () => abort("'stringToUTF8Array' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF8")) Module["stringToUTF8"] = () => abort("'stringToUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF8")) Module["lengthBytesUTF8"] = () => abort("'lengthBytesUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stackTrace")) Module["stackTrace"] = () => abort("'stackTrace' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "addOnPreRun")) Module["addOnPreRun"] = () => abort("'addOnPreRun' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "addOnInit")) Module["addOnInit"] = () => abort("'addOnInit' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "addOnPreMain")) Module["addOnPreMain"] = () => abort("'addOnPreMain' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "addOnExit")) Module["addOnExit"] = () => abort("'addOnExit' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "addOnPostRun")) Module["addOnPostRun"] = () => abort("'addOnPostRun' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeStringToMemory")) Module["writeStringToMemory"] = () => abort("'writeStringToMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeArrayToMemory")) Module["writeArrayToMemory"] = () => abort("'writeArrayToMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeAsciiToMemory")) Module["writeAsciiToMemory"] = () => abort("'writeAsciiToMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["addRunDependency"] = addRunDependency;
Module["removeRunDependency"] = removeRunDependency;
if (!Object.getOwnPropertyDescriptor(Module, "FS_createFolder")) Module["FS_createFolder"] = () => abort("'FS_createFolder' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["FS_createPath"] = FS.createPath;
Module["FS_createDataFile"] = FS.createDataFile;
Module["FS_createPreloadedFile"] = FS.createPreloadedFile;
Module["FS_createLazyFile"] = FS.createLazyFile;
if (!Object.getOwnPropertyDescriptor(Module, "FS_createLink")) Module["FS_createLink"] = () => abort("'FS_createLink' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["FS_createDevice"] = FS.createDevice;
Module["FS_unlink"] = FS.unlink;
if (!Object.getOwnPropertyDescriptor(Module, "getLEB")) Module["getLEB"] = () => abort("'getLEB' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getFunctionTables")) Module["getFunctionTables"] = () => abort("'getFunctionTables' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "alignFunctionTables")) Module["alignFunctionTables"] = () => abort("'alignFunctionTables' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerFunctions")) Module["registerFunctions"] = () => abort("'registerFunctions' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "addFunction")) Module["addFunction"] = () => abort("'addFunction' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "removeFunction")) Module["removeFunction"] = () => abort("'removeFunction' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getFuncWrapper")) Module["getFuncWrapper"] = () => abort("'getFuncWrapper' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "prettyPrint")) Module["prettyPrint"] = () => abort("'prettyPrint' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "dynCall")) Module["dynCall"] = () => abort("'dynCall' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getCompilerSetting")) Module["getCompilerSetting"] = () => abort("'getCompilerSetting' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "print")) Module["print"] = () => abort("'print' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "printErr")) Module["printErr"] = () => abort("'printErr' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getTempRet0")) Module["getTempRet0"] = () => abort("'getTempRet0' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "setTempRet0")) Module["setTempRet0"] = () => abort("'setTempRet0' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["callMain"] = callMain;
if (!Object.getOwnPropertyDescriptor(Module, "abort")) Module["abort"] = () => abort("'abort' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "keepRuntimeAlive")) Module["keepRuntimeAlive"] = () => abort("'keepRuntimeAlive' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "zeroMemory")) Module["zeroMemory"] = () => abort("'zeroMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stringToNewUTF8")) Module["stringToNewUTF8"] = () => abort("'stringToNewUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "emscripten_realloc_buffer")) Module["emscripten_realloc_buffer"] = () => abort("'emscripten_realloc_buffer' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["ENV"] = ENV;
if (!Object.getOwnPropertyDescriptor(Module, "withStackSave")) Module["withStackSave"] = () => abort("'withStackSave' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["ERRNO_CODES"] = ERRNO_CODES;
if (!Object.getOwnPropertyDescriptor(Module, "ERRNO_MESSAGES")) Module["ERRNO_MESSAGES"] = () => abort("'ERRNO_MESSAGES' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "setErrNo")) Module["setErrNo"] = () => abort("'setErrNo' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "inetPton4")) Module["inetPton4"] = () => abort("'inetPton4' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "inetNtop4")) Module["inetNtop4"] = () => abort("'inetNtop4' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "inetPton6")) Module["inetPton6"] = () => abort("'inetPton6' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "inetNtop6")) Module["inetNtop6"] = () => abort("'inetNtop6' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "readSockaddr")) Module["readSockaddr"] = () => abort("'readSockaddr' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeSockaddr")) Module["writeSockaddr"] = () => abort("'writeSockaddr' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "DNS")) Module["DNS"] = () => abort("'DNS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getHostByName")) Module["getHostByName"] = () => abort("'getHostByName' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "Protocols")) Module["Protocols"] = () => abort("'Protocols' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "Sockets")) Module["Sockets"] = () => abort("'Sockets' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getRandomDevice")) Module["getRandomDevice"] = () => abort("'getRandomDevice' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "traverseStack")) Module["traverseStack"] = () => abort("'traverseStack' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "convertFrameToPC")) Module["convertFrameToPC"] = () => abort("'convertFrameToPC' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "UNWIND_CACHE")) Module["UNWIND_CACHE"] = () => abort("'UNWIND_CACHE' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "saveInUnwindCache")) Module["saveInUnwindCache"] = () => abort("'saveInUnwindCache' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "convertPCtoSourceLocation")) Module["convertPCtoSourceLocation"] = () => abort("'convertPCtoSourceLocation' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "readAsmConstArgsArray")) Module["readAsmConstArgsArray"] = () => abort("'readAsmConstArgsArray' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "readAsmConstArgs")) Module["readAsmConstArgs"] = () => abort("'readAsmConstArgs' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "mainThreadEM_ASM")) Module["mainThreadEM_ASM"] = () => abort("'mainThreadEM_ASM' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "jstoi_q")) Module["jstoi_q"] = () => abort("'jstoi_q' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "jstoi_s")) Module["jstoi_s"] = () => abort("'jstoi_s' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getExecutableName")) Module["getExecutableName"] = () => abort("'getExecutableName' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "listenOnce")) Module["listenOnce"] = () => abort("'listenOnce' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "autoResumeAudioContext")) Module["autoResumeAudioContext"] = () => abort("'autoResumeAudioContext' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "dynCallLegacy")) Module["dynCallLegacy"] = () => abort("'dynCallLegacy' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getDynCaller")) Module["getDynCaller"] = () => abort("'getDynCaller' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "dynCall")) Module["dynCall"] = () => abort("'dynCall' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "callRuntimeCallbacks")) Module["callRuntimeCallbacks"] = () => abort("'callRuntimeCallbacks' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "wasmTableMirror")) Module["wasmTableMirror"] = () => abort("'wasmTableMirror' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "setWasmTableEntry")) Module["setWasmTableEntry"] = () => abort("'setWasmTableEntry' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getWasmTableEntry")) Module["getWasmTableEntry"] = () => abort("'getWasmTableEntry' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "handleException")) Module["handleException"] = () => abort("'handleException' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "runtimeKeepalivePush")) Module["runtimeKeepalivePush"] = () => abort("'runtimeKeepalivePush' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "runtimeKeepalivePop")) Module["runtimeKeepalivePop"] = () => abort("'runtimeKeepalivePop' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "callUserCallback")) Module["callUserCallback"] = () => abort("'callUserCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "maybeExit")) Module["maybeExit"] = () => abort("'maybeExit' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "safeSetTimeout")) Module["safeSetTimeout"] = () => abort("'safeSetTimeout' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "asmjsMangle")) Module["asmjsMangle"] = () => abort("'asmjsMangle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "asyncLoad")) Module["asyncLoad"] = () => abort("'asyncLoad' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "alignMemory")) Module["alignMemory"] = () => abort("'alignMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "mmapAlloc")) Module["mmapAlloc"] = () => abort("'mmapAlloc' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "reallyNegative")) Module["reallyNegative"] = () => abort("'reallyNegative' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "unSign")) Module["unSign"] = () => abort("'unSign' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "reSign")) Module["reSign"] = () => abort("'reSign' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "formatString")) Module["formatString"] = () => abort("'formatString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["PATH"] = PATH;
if (!Object.getOwnPropertyDescriptor(Module, "PATH_FS")) Module["PATH_FS"] = () => abort("'PATH_FS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "SYSCALLS")) Module["SYSCALLS"] = () => abort("'SYSCALLS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getSocketFromFD")) Module["getSocketFromFD"] = () => abort("'getSocketFromFD' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getSocketAddress")) Module["getSocketAddress"] = () => abort("'getSocketAddress' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "JSEvents")) Module["JSEvents"] = () => abort("'JSEvents' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerKeyEventCallback")) Module["registerKeyEventCallback"] = () => abort("'registerKeyEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "specialHTMLTargets")) Module["specialHTMLTargets"] = () => abort("'specialHTMLTargets' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "maybeCStringToJsString")) Module["maybeCStringToJsString"] = () => abort("'maybeCStringToJsString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "findEventTarget")) Module["findEventTarget"] = () => abort("'findEventTarget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "findCanvasEventTarget")) Module["findCanvasEventTarget"] = () => abort("'findCanvasEventTarget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getBoundingClientRect")) Module["getBoundingClientRect"] = () => abort("'getBoundingClientRect' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "fillMouseEventData")) Module["fillMouseEventData"] = () => abort("'fillMouseEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerMouseEventCallback")) Module["registerMouseEventCallback"] = () => abort("'registerMouseEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerWheelEventCallback")) Module["registerWheelEventCallback"] = () => abort("'registerWheelEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerUiEventCallback")) Module["registerUiEventCallback"] = () => abort("'registerUiEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerFocusEventCallback")) Module["registerFocusEventCallback"] = () => abort("'registerFocusEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "fillDeviceOrientationEventData")) Module["fillDeviceOrientationEventData"] = () => abort("'fillDeviceOrientationEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerDeviceOrientationEventCallback")) Module["registerDeviceOrientationEventCallback"] = () => abort("'registerDeviceOrientationEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "fillDeviceMotionEventData")) Module["fillDeviceMotionEventData"] = () => abort("'fillDeviceMotionEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerDeviceMotionEventCallback")) Module["registerDeviceMotionEventCallback"] = () => abort("'registerDeviceMotionEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "screenOrientation")) Module["screenOrientation"] = () => abort("'screenOrientation' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "fillOrientationChangeEventData")) Module["fillOrientationChangeEventData"] = () => abort("'fillOrientationChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerOrientationChangeEventCallback")) Module["registerOrientationChangeEventCallback"] = () => abort("'registerOrientationChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "fillFullscreenChangeEventData")) Module["fillFullscreenChangeEventData"] = () => abort("'fillFullscreenChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerFullscreenChangeEventCallback")) Module["registerFullscreenChangeEventCallback"] = () => abort("'registerFullscreenChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerRestoreOldStyle")) Module["registerRestoreOldStyle"] = () => abort("'registerRestoreOldStyle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "hideEverythingExceptGivenElement")) Module["hideEverythingExceptGivenElement"] = () => abort("'hideEverythingExceptGivenElement' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "restoreHiddenElements")) Module["restoreHiddenElements"] = () => abort("'restoreHiddenElements' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "setLetterbox")) Module["setLetterbox"] = () => abort("'setLetterbox' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "currentFullscreenStrategy")) Module["currentFullscreenStrategy"] = () => abort("'currentFullscreenStrategy' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "restoreOldWindowedStyle")) Module["restoreOldWindowedStyle"] = () => abort("'restoreOldWindowedStyle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "softFullscreenResizeWebGLRenderTarget")) Module["softFullscreenResizeWebGLRenderTarget"] = () => abort("'softFullscreenResizeWebGLRenderTarget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "doRequestFullscreen")) Module["doRequestFullscreen"] = () => abort("'doRequestFullscreen' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "fillPointerlockChangeEventData")) Module["fillPointerlockChangeEventData"] = () => abort("'fillPointerlockChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerPointerlockChangeEventCallback")) Module["registerPointerlockChangeEventCallback"] = () => abort("'registerPointerlockChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerPointerlockErrorEventCallback")) Module["registerPointerlockErrorEventCallback"] = () => abort("'registerPointerlockErrorEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "requestPointerLock")) Module["requestPointerLock"] = () => abort("'requestPointerLock' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "fillVisibilityChangeEventData")) Module["fillVisibilityChangeEventData"] = () => abort("'fillVisibilityChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerVisibilityChangeEventCallback")) Module["registerVisibilityChangeEventCallback"] = () => abort("'registerVisibilityChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerTouchEventCallback")) Module["registerTouchEventCallback"] = () => abort("'registerTouchEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "fillGamepadEventData")) Module["fillGamepadEventData"] = () => abort("'fillGamepadEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerGamepadEventCallback")) Module["registerGamepadEventCallback"] = () => abort("'registerGamepadEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerBeforeUnloadEventCallback")) Module["registerBeforeUnloadEventCallback"] = () => abort("'registerBeforeUnloadEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "fillBatteryEventData")) Module["fillBatteryEventData"] = () => abort("'fillBatteryEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "battery")) Module["battery"] = () => abort("'battery' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "registerBatteryEventCallback")) Module["registerBatteryEventCallback"] = () => abort("'registerBatteryEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "setCanvasElementSize")) Module["setCanvasElementSize"] = () => abort("'setCanvasElementSize' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getCanvasElementSize")) Module["getCanvasElementSize"] = () => abort("'getCanvasElementSize' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "demangle")) Module["demangle"] = () => abort("'demangle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "demangleAll")) Module["demangleAll"] = () => abort("'demangleAll' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "jsStackTrace")) Module["jsStackTrace"] = () => abort("'jsStackTrace' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stackTrace")) Module["stackTrace"] = () => abort("'stackTrace' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getEnvStrings")) Module["getEnvStrings"] = () => abort("'getEnvStrings' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "checkWasiClock")) Module["checkWasiClock"] = () => abort("'checkWasiClock' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToI64")) Module["writeI53ToI64"] = () => abort("'writeI53ToI64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToI64Clamped")) Module["writeI53ToI64Clamped"] = () => abort("'writeI53ToI64Clamped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToI64Signaling")) Module["writeI53ToI64Signaling"] = () => abort("'writeI53ToI64Signaling' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToU64Clamped")) Module["writeI53ToU64Clamped"] = () => abort("'writeI53ToU64Clamped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToU64Signaling")) Module["writeI53ToU64Signaling"] = () => abort("'writeI53ToU64Signaling' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "readI53FromI64")) Module["readI53FromI64"] = () => abort("'readI53FromI64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "readI53FromU64")) Module["readI53FromU64"] = () => abort("'readI53FromU64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "convertI32PairToI53")) Module["convertI32PairToI53"] = () => abort("'convertI32PairToI53' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "convertU32PairToI53")) Module["convertU32PairToI53"] = () => abort("'convertU32PairToI53' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "setImmediateWrapped")) Module["setImmediateWrapped"] = () => abort("'setImmediateWrapped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "clearImmediateWrapped")) Module["clearImmediateWrapped"] = () => abort("'clearImmediateWrapped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "polyfillSetImmediate")) Module["polyfillSetImmediate"] = () => abort("'polyfillSetImmediate' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "uncaughtExceptionCount")) Module["uncaughtExceptionCount"] = () => abort("'uncaughtExceptionCount' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "exceptionLast")) Module["exceptionLast"] = () => abort("'exceptionLast' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "exceptionCaught")) Module["exceptionCaught"] = () => abort("'exceptionCaught' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "ExceptionInfo")) Module["ExceptionInfo"] = () => abort("'ExceptionInfo' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "CatchInfo")) Module["CatchInfo"] = () => abort("'CatchInfo' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "exception_addRef")) Module["exception_addRef"] = () => abort("'exception_addRef' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "exception_decRef")) Module["exception_decRef"] = () => abort("'exception_decRef' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "Browser")) Module["Browser"] = () => abort("'Browser' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "funcWrappers")) Module["funcWrappers"] = () => abort("'funcWrappers' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "getFuncWrapper")) Module["getFuncWrapper"] = () => abort("'getFuncWrapper' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "setMainLoop")) Module["setMainLoop"] = () => abort("'setMainLoop' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "wget")) Module["wget"] = () => abort("'wget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["FS"] = FS;
if (!Object.getOwnPropertyDescriptor(Module, "MEMFS")) Module["MEMFS"] = () => abort("'MEMFS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "TTY")) Module["TTY"] = () => abort("'TTY' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "PIPEFS")) Module["PIPEFS"] = () => abort("'PIPEFS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "SOCKFS")) Module["SOCKFS"] = () => abort("'SOCKFS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "_setNetworkCallback")) Module["_setNetworkCallback"] = () => abort("'_setNetworkCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "tempFixedLengthArray")) Module["tempFixedLengthArray"] = () => abort("'tempFixedLengthArray' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "miniTempWebGLFloatBuffers")) Module["miniTempWebGLFloatBuffers"] = () => abort("'miniTempWebGLFloatBuffers' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "heapObjectForWebGLType")) Module["heapObjectForWebGLType"] = () => abort("'heapObjectForWebGLType' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "heapAccessShiftForWebGLHeap")) Module["heapAccessShiftForWebGLHeap"] = () => abort("'heapAccessShiftForWebGLHeap' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "GL")) Module["GL"] = () => abort("'GL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGet")) Module["emscriptenWebGLGet"] = () => abort("'emscriptenWebGLGet' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "computeUnpackAlignedImageSize")) Module["computeUnpackAlignedImageSize"] = () => abort("'computeUnpackAlignedImageSize' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGetTexPixelData")) Module["emscriptenWebGLGetTexPixelData"] = () => abort("'emscriptenWebGLGetTexPixelData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGetUniform")) Module["emscriptenWebGLGetUniform"] = () => abort("'emscriptenWebGLGetUniform' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "webglGetUniformLocation")) Module["webglGetUniformLocation"] = () => abort("'webglGetUniformLocation' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "webglPrepareUniformLocationsBeforeFirstUse")) Module["webglPrepareUniformLocationsBeforeFirstUse"] = () => abort("'webglPrepareUniformLocationsBeforeFirstUse' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "webglGetLeftBracePos")) Module["webglGetLeftBracePos"] = () => abort("'webglGetLeftBracePos' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGetVertexAttrib")) Module["emscriptenWebGLGetVertexAttrib"] = () => abort("'emscriptenWebGLGetVertexAttrib' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "writeGLArray")) Module["writeGLArray"] = () => abort("'writeGLArray' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "AL")) Module["AL"] = () => abort("'AL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "SDL_unicode")) Module["SDL_unicode"] = () => abort("'SDL_unicode' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "SDL_ttfContext")) Module["SDL_ttfContext"] = () => abort("'SDL_ttfContext' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "SDL_audio")) Module["SDL_audio"] = () => abort("'SDL_audio' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "SDL")) Module["SDL"] = () => abort("'SDL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "SDL_gfx")) Module["SDL_gfx"] = () => abort("'SDL_gfx' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "GLUT")) Module["GLUT"] = () => abort("'GLUT' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "EGL")) Module["EGL"] = () => abort("'EGL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "GLFW_Window")) Module["GLFW_Window"] = () => abort("'GLFW_Window' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "GLFW")) Module["GLFW"] = () => abort("'GLFW' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "GLEW")) Module["GLEW"] = () => abort("'GLEW' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "IDBStore")) Module["IDBStore"] = () => abort("'IDBStore' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "runAndAbortIfError")) Module["runAndAbortIfError"] = () => abort("'runAndAbortIfError' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "Asyncify")) Module["Asyncify"] = () => abort("'Asyncify' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "Fibers")) Module["Fibers"] = () => abort("'Fibers' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "warnOnce")) Module["warnOnce"] = () => abort("'warnOnce' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stackSave")) Module["stackSave"] = () => abort("'stackSave' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stackRestore")) Module["stackRestore"] = () => abort("'stackRestore' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stackAlloc")) Module["stackAlloc"] = () => abort("'stackAlloc' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "AsciiToString")) Module["AsciiToString"] = () => abort("'AsciiToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stringToAscii")) Module["stringToAscii"] = () => abort("'stringToAscii' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "UTF16ToString")) Module["UTF16ToString"] = () => abort("'UTF16ToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF16")) Module["stringToUTF16"] = () => abort("'stringToUTF16' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF16")) Module["lengthBytesUTF16"] = () => abort("'lengthBytesUTF16' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "UTF32ToString")) Module["UTF32ToString"] = () => abort("'UTF32ToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF32")) Module["stringToUTF32"] = () => abort("'stringToUTF32' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF32")) Module["lengthBytesUTF32"] = () => abort("'lengthBytesUTF32' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "allocateUTF8")) Module["allocateUTF8"] = () => abort("'allocateUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
if (!Object.getOwnPropertyDescriptor(Module, "allocateUTF8OnStack")) Module["allocateUTF8OnStack"] = () => abort("'allocateUTF8OnStack' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)");
Module["writeStackCookie"] = writeStackCookie;
Module["checkStackCookie"] = checkStackCookie;
if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_NORMAL")) Object.defineProperty(Module, "ALLOC_NORMAL", { configurable: true, get: function () { abort("'ALLOC_NORMAL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_STACK")) Object.defineProperty(Module, "ALLOC_STACK", { configurable: true, get: function () { abort("'ALLOC_STACK' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

var calledRun;

/**
 * @constructor
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
}

var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!calledRun) run();
  if (!calledRun) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
};

function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  var entryFunction = Module['_main'];

  args = args || [];

  var argc = args.length + 1;
  var argv = stackAlloc((argc + 1) * 4);
  HEAP32[argv >> 2] = allocateUTF8OnStack(thisProgram);
  for (var i = 1; i < argc; i++) {
    HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
  }
  HEAP32[(argv >> 2) + argc] = 0;

  try {

    var ret = entryFunction(argc, argv);

    // In PROXY_TO_PTHREAD builds, we should never exit the runtime below, as
    // execution is asynchronously handed off to a pthread.
    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
    return ret;
  }
  catch (e) {
    return handleException(e);
  } finally {
    calledMain = true;

  }
}

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  _emscripten_stack_init();
  writeStackCookie();
}

/** @type {function(Array=)} */
function run(args) {
  args = args || arguments_;

  if (runDependencies > 0) {
    return;
  }

  stackCheckInit();

  preRun();

  // a preRun added a dependency, run will be called later
  if (runDependencies > 0) {
    return;
  }

  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    if (calledRun) return;
    calledRun = true;
    Module['calledRun'] = true;

    if (ABORT) return;

    initRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (shouldRunNow) callMain(args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function () {
      setTimeout(function () {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  }
  try { // it doesn't matter if it fails
    ___stdio_exit();
    // also flush in the JS FS layer
    ['stdout', 'stderr'].forEach(function (name) {
      var info = FS.analyzePath('/dev/' + name);
      if (!info) return;
      var stream = info.object;
      var rdev = stream.rdev;
      var tty = TTY.ttys[rdev];
      if (tty && tty.output && tty.output.length) {
        has = true;
      }
    });
  } catch (e) { }
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

/** @param {boolean|number=} implicit */
function exit(status, implicit) {
  EXITSTATUS = status;

  // Skip this check if the runtime is being kept alive deliberately.
  // For example if `exit_with_live_runtime` is called.
  if (!runtimeKeepaliveCounter) {
    checkUnflushedContent();
  }

  if (keepRuntimeAlive()) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      var msg = 'program exited (with status: ' + status + '), but EXIT_RUNTIME is not set, so halting execution but not exiting the runtime or preventing further async execution (build with EXIT_RUNTIME=1, if you want a true shutdown)';
      err(msg);
    }
  } else {
    exitRuntime();
  }

  procExit(status);
}

function procExit(code) {
  EXITSTATUS = code;
  if (!keepRuntimeAlive()) {
    if (Module['onExit']) Module['onExit'](code);
    ABORT = true;
  }
  quit_(code, new ExitStatus(code));
}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;

if (Module['noInitialRun']) shouldRunNow = false;

run();





