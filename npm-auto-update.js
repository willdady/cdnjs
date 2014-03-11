var path = require("path"),
    fs = require("fs-extra"),
    glob = require("glob"),
    _ = require('lodash'),
    request = require("superagent"),
    async = require("async"),
    tarball = require('tarball-extract'),
    mkdirp = require('mkdirp');

var parse = function (json_file, ignore_missing, ignore_parse_fail) {
    var content;

    try {
        content = fs.readFileSync(json_file, 'utf8');
    } catch (err1) {
        if (!ignore_missing) {
            assert.ok(0, json_file + " doesn't exist!");
        }
        return null;
    }
    try {
        return JSON.parse(content);
    } catch (err2) {
        if (!ignore_parse_fail) {
            assert.ok(0, json_file + " failed to parse");
        }
        return null;
    }
}

var updateLibrary = function (pkg, callback) {
    console.log('Checking versions for ' + pkg.npmName);
    request.get('http://registry.npmjs.org/' + pkg.npmName, function(result) {
        _.each(result.body.versions, function(data, version) {
            var path = './ajax/libs/' + pkg.name + '/' + version;
            console.log(path);
            if(!fs.existsSync(path)) {
                console.log('dont have', version);
                fs.mkdirSync(path);
                var url = data.dist.tarball;
                var download_file = path + '/dist.tar.gz';
                tarball.extractTarballDownload(url , download_file, path, {}, function(err, result) {
                    console.log('this is happening sync');
                    fs.unlinkSync(download_file);
                    var folderName = fs.readdirSync(path)[0];

                    var npmFileMap = pkg.npmFileMap;

                    _.each(npmFileMap, function(fileSpec) {
                        var basePath = fileSpec.basePath || "";

                        _.each(fileSpec.files, function(file) {
                            var extractPath = basePath + "/" + file;
                            var files = glob.sync(path + "/" + folderName + "/" + basePath + "/" + file);

                            _.each(files, function(extractFilePath) {
                                if(extractFilePath.slice(-4) == ".zip") return;
                                if(extractFilePath.indexOf("dependencies") !== -1) return;
                                var replacePath = folderName + "/" + basePath + "/";
                                replacePath = replacePath.replace(/\/\//g, "/");
                                var actualPath = extractFilePath.replace(replacePath, "");
                                fs.renameSync(extractFilePath, actualPath);
                            });
                        });
                    });

                    fs.removeSync(path + '/' + folderName);
                });
                console.log("Do not have version", version, "of", pkg.npmName);
            }
        });
        var npmVersion = result.body['dist-tags'].latest;
        pkg.version = npmVersion;
        fs.writeFileSync('ajax/libs/' + pkg.name + '/package.json', JSON.stringify(pkg, null, 2), 'utf8');

        callback(null, pkg['npm-name']);
    });
}

console.log('Looking for npm enabled libraries...');

// load up those files
var packages = glob.sync("./ajax/libs/**/package.json");
packages = _(packages).map(function (pkg) {
    var parsedPkg = parse(pkg);
    return parsedPkg.npmName ? parsedPkg : null;
}).compact().value();

console.log('Found ' + packages.length + ' npm enabled libraries');
var libraryUpdates = [];
_.each(packages, function(pkg) {
    libraryUpdates.push(function (callback) {
      updateLibrary(pkg, callback);
    });;
});
async.series(libraryUpdates, function(err, results) {
  console.log('Script completed');
});
