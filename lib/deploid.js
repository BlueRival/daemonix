"use strict";

var async = require( 'async' );
var fs = require( 'fs' );
var childProcess = require( 'child_process' );
var tmp = require( 'temporary' );

var processExecDebugOn = false;
var processExec = function() {

	var logging = [];
	var done = null;

	var storeDone = function( args, i ) {

		done = args[ i ];

		args[ i ] = function() {
			if ( processExecDebugOn ) {
				console.error( 'result', arguments );
			}
			done.apply( {}, arguments );
		};
	};

	for ( var i = 0; i < arguments.length; i++ ) {
		if ( done === null && typeof arguments[ i ] === 'function' ) {
			storeDone( arguments, i );
			break;
		} else {
			logging.push( arguments[ i ] );
		}
	}

	if ( processExecDebugOn ) {
		console.error( 'executing', logging );
	}
	childProcess.exec.apply( childProcess, arguments );

};

var Deploid = function( config ) {

	this._config = config;

	processExecDebugOn = this._config.debug;

	if ( !config.hasOwnProperty( 'user' ) ) {
		config.user = config.name;
	}

	if ( !config.hasOwnProperty( 'daemon' ) ) {
		config.daemon = config.name;
	}

};

Deploid.prototype.execute = function( done ) {

	var _done = function( err ) {

		self._execDinit( function() {
			if ( err ) {
				done( err );
			} else {
				done();
			}
		} );

	};

	var self = this;
	async.series( [
		function( done ) {
			if ( self._config.version.match( /[^A-Za-z\-0-9\.\/]/ ) ) {
				done( 'version may only contain the characters A-Z, a-z, -, 0-9, ., and /' );
				return;
			}

			self._config.branch = self._config.version;
			self._config.version = self._config.version.replace( /\//g, '_' );

			done( null );
		},
		function( done ) {
			self._execInit( done );
		},
		function( done ) {
			self._buildPackage( done );
		},
		function( done ) {
			self._deployNodes( done );
		}
	], function( err ) {
		_done( err );
	} );

};

Deploid.prototype._execInit = function( done ) {

	console.error( "\nInitializing deployment." );

	var self = this;
	async.series( [
		function( done ) {
			self._prepareTmpDir( done );
		},
		function( done ) {
			self._prepareSrcDir( done );
		},
		function( done ) {
			self._prepareNvmDir( done );
		}
	], function( err ) {

		if ( err ) {
			done( err );
			return;
		}

		console.error( 'Initialized deployment.' );
		done();

	} );

};

Deploid.prototype._execDinit = function( done ) {

	// leave tmp files in place for debugging
	if ( this._tmpDir && !processExecDebugOn ) {
		this._rmdir( this._tmpDir, done );
	} else {

		if ( processExecDebugOn ) {
			console.error( 'Temporary directory not deleted for debugging: ', this._tmpDir );
		}

		done();
	}

};

Deploid.prototype._buildPackage = function( done ) {

	var self = this;
	var cacheFile = self._packageCacheFile = self._config.packageDir + '/' + self._config.version + '.tar.gz';

	var buildCacheEntry = function() {

		console.error( 'Building package.' );

		var tmpDir = self._tmpDir + '/' + self._config.version;
		var tmpSrcDir = tmpDir + '/src';
		var tmpNvmDir = tmpDir + '/nvm';

		var nodeBinaryDirOffset = null;

		var packageJson = {};

		async.series( [
			function( done ) {
				fs.mkdir( tmpDir, done );
			},
			function( done ) {
				fs.mkdir( tmpSrcDir, done );
			},
			function( done ) {
				fs.mkdir( tmpNvmDir, done );
			},
			function( done ) {
				console.error( 'Cloning source dir.' );
				processExec( 'rsync -azr ' + self._config.srcDir.replace( /\/$/, '' ) + '/ ' + tmpSrcDir, done );
			},
			function( done ) {
				console.error( 'Checking out ' + self._config.version + '.' );
				processExec( 'git checkout ' + self._config.branch, { cwd: tmpSrcDir }, done );
			},
			function( done ) {
				getPackageFile( tmpSrcDir + '/package.json', function( err, contents ) {

					if ( err ) {
						done( err );
						return;
					}

					packageJson = contents;

					done();
				} );
			},
			function( done ) {
				getNodeVersion( packageJson, function( err, nodeVersion ) {

					if ( err ) {
						done( err );
						return;
					}

					self._config.nodeVersion = nodeVersion;

					done();
				} );
			},
			function( done ) {
				console.error( 'Clear Git repo from deployment package.' );
				self._rmdir( tmpSrcDir + '/.git', done );
			},
			function( done ) {
				console.error( 'Copying NVM src.' );
				processExec( 'rsync -azr /tmp/nvm.tmp/ ' + tmpNvmDir, done );
			},
			function( done ) {
				console.error( 'Installing node version ' + self._config.nodeVersion + ' in NVM.' );
				processExec( __dirname + '/nvmSetup.sh ' + tmpNvmDir + ' ' + self._config.nodeVersion, function( err, data ) {

					if ( err ) {
						done( err );
						return;
					}

					done();
				} );
			},
			function( done ) {

				self._config.nodeVersion = null;
				async.parallel( [
					function( done ) {
						fs.readdir( tmpNvmDir, function( err, files ) {

							if ( err ) {
								done();
								return;
							}

							var newNodeVersion = null;
							for ( var i = 0; i < files.length && newNodeVersion === null; i++ ) {
								var match = files[ i ].match( /^v([0-9]+\.[0-9]+\.[0-9]+)$/ );
								if ( match ) {
									newNodeVersion = match[ 1 ];
								}
							}

							if ( newNodeVersion === null ) {
								done();
								return;
							}

							self._config.nodeVersion = newNodeVersion;
							nodeBinaryDirOffset = '';

							done();

						} );
					},
					function( done ) {
						fs.readdir( tmpNvmDir + '/versions/node', function( err, files ) {

							if ( err ) {
								done();
								return;
							}

							var newNodeVersion = null;
							for ( var i = 0; i < files.length && newNodeVersion === null; i++ ) {
								var match = files[ i ].match( /^v([0-9]+\.[0-9]+\.[0-9]+)$/ );
								if ( match ) {
									newNodeVersion = match[ 1 ];
								}
							}

							if ( newNodeVersion === null ) {
								done();
								return;
							}

							self._config.nodeVersion = newNodeVersion;
							nodeBinaryDirOffset = 'versions/node/';

							done();

						} );
					}
				], function() {
					if ( self._config.nodeVersion === null ) {
						done( new Error( 'could not find node installation' ) );
						return;
					}

					done();
				} );
			},
			function( done ) {
				console.error( 'Linking to current node version: ' + nodeBinaryDirOffset + 'v' + self._config.nodeVersion );
				processExec( 'ln -s ' + nodeBinaryDirOffset + 'v' + self._config.nodeVersion + ' vCurrent', { cwd: tmpNvmDir }, done );
			},
			function( done ) {
				console.error( 'Performing npm installation.' );
				processExec( tmpNvmDir + '/vCurrent/bin/npm install --production', { cwd: tmpSrcDir }, done );
			},
			function( done ) {
				if ( packageJson && packageJson.scripts && packageJson.scripts.build ) {
					console.error( 'Performing npm build.' );
					processExec( tmpNvmDir + '/vCurrent/bin/npm run-script build', { cwd: tmpSrcDir }, done );
				} else {
					console.error( 'No npm build script.' );
					done();
				}
			},
			function( done ) {
				console.error( 'Boxing up package.' );
				processExec( 'tar -cz ' + self._config.version + ' >| ' + self._config.version + '.tar.gz', { cwd: self._tmpDir }, done );
			},
			function( done ) {
				console.error( 'Caching package.' );
				fs.rename( self._tmpDir + '/' + self._config.version + '.tar.gz', cacheFile, done );
			}
		], function( err, results ) {

			if ( err ) {
				done( err );
				return;
			}

			console.error( 'Built package.' );

			done();
		} );

	};

	if ( self._config.forceRebuild ) {
		buildCacheEntry();
	} else {
		fs.exists( cacheFile, function( exists ) {
			if ( exists ) {
				console.error( 'Using cached package.' );
				done();
			} else {
				buildCacheEntry();
			}
		} );
	}

};

Deploid.prototype._createUpstartConfFile = function( upstartFile, done ) {

	var self = this;

	var template = '';

	async.series( [
		function( done ) {
			fs.readFile( __dirname + '/upstart.txt', { encoding: 'utf8' }, function( err, data ) {

				if ( err ) {
					done( err );
					return;
				}

				data = data || '';

				if ( self._config.hasOwnProperty( 'loggingMode' ) && self._config.loggingMode === 'file' ) {
					self._config.stdout = '/dev/null';
				} else {
					self._config.stdout = '$NODE_LOG_FILE';
				}

				for ( var field in self._config ) {
					if ( self._config.hasOwnProperty( field ) ) {
						var regEx = new RegExp( '\\{\\{' + field + '\\}\\}', 'g' );
						data = data.replace( regEx, self._config[ field ] );
					}
				}

				template = data;
				done();
			} );
		},
		function( done ) {
			fs.writeFile( upstartFile, template, done );
		}
	], done );

};

Deploid.prototype._deployNodes = function( done ) {

	console.error( 'Deploying nodes.' );

	var self = this;
	var tasks = [];

	var pushTask = function( node ) {
		tasks.push( function( done ) {
			self._deployNode( node, done );
		} );
	};

	this._config.nodes.forEach( pushTask );

	// clusters should run at least 25% idle, so having 10% of nodes offline at a time should be OK.
	var limit = Math.max( 1, Math.ceil( this._config.nodes.length / 10 ) );

	async.parallelLimit( tasks, limit, function( err ) {
		if ( err ) {
			done( err );
			return;
		}

		console.error( 'Deployed nodes.' );
		done();
	} );

};

Deploid.prototype._deployNode = function( node, done ) {

	console.error( 'Deploying node ' + node + '.' );

	var self = this;

	var start = function() {

		self._runSshCmd( node, 'sudo service ' + self._config.daemon + ' start', function( err ) {

			if ( err ) {
				done( err );
				return;
			}

			console.error( 'Deployed node ' + node + '.' );
			done();

		} );
	};

	var deploy = function() {

		console.error( 'Configuring package on ' + node );
		async.parallel( [
			function( done ) {
				self._setupNodeUser( node, done );
			},
			function( done ) {
				self._setupNodeAppCode( node, done );
			},
			function( done ) {
				self._setupNodeUpstart( node, done );
			}
		], function( err ) {

			if ( err ) {
				done( err );
				return;
			}

			console.error( 'Configured package on ' + node );
			start();

		} );
	};

	var packageFile = '/tmp/' + self._packageCacheFile.replace( /^.*\//, '' );
	var tmpUpstartConf = this._tmpDir + '/' + self._config.daemon + '-' + process.pid + '.conf';

	console.error( 'Sending package to ' + node + '.' );
	async.series( [
		function( done ) {
			self._scp( self._packageCacheFile, node, '/tmp', done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo mkdir -p ' + self._tmpDirRemote, function() {
				done();
			} );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo rm -rf ' + self._tmpDirRemote + self._config.version, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo tar --directory ' + self._tmpDirRemote + ' -xzf ' + packageFile, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo rm -rf ' + packageFile, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo mkdir -p /opt/apps/' + self._config.daemon, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo service ' + self._config.daemon + ' stop', function() {
				done();
			} );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo rm -rf /opt/apps/' + self._config.daemon + '/' + self._config.version, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo mv ' + self._tmpDirRemote + self._config.version + ' /opt/apps/' + self._config.daemon, done );
		},
		function( done ) {
			self._createUpstartConfFile( tmpUpstartConf, done );
		},
		function( done ) {
			self._scp( tmpUpstartConf, node, '/opt/apps/' + self._config.daemon + '/' + self._config.version + '/' + self._config.daemon + '.conf', done );
		}
	], function( err ) {

		if ( err ) {
			done( err );
			return;
		}

		console.error( 'Sent package to ' + node + '.' );
		deploy();
	} );

};

Deploid.prototype._setupNodeUser = function( node, done ) {

	console.error( 'Ensure user exists on node ' + node + '.' );

	var self = this;

	async.series( [
		function( done ) {

			self._runSshCmd( node, 'sudo adduser --system --no-create-home --group ' + self._config.user, function( err ) {

//				if ( err ) {
//					done( err );
//					return;
//				}

				done();
			} );

		},
		function( done ) {

			self._runSshCmd( node, 'sudo addgroup --system ' + self._config.user, function( err ) {

//				if ( err ) {
//					done( err );
//					return;
//				}

				done();
			} );

		},
		function( done ) {

			self._runSshCmd( node, 'sudo usermod -g ' + self._config.user + ' ' + self._config.user, function( err ) {

//				if ( err ) {
//					done( err );
//					return;
//				}

				done();
			} );

		}
	], done );

};

Deploid.prototype._setupNodeUpstart = function( node, done ) {

	console.error( 'Setup Upstart on node ' + node + '.' );

	var self = this;
	async.series( [
		function( done ) {
			self._runSshCmd( node, 'sudo cp /opt/apps/' + self._config.daemon + '/' + self._config.version + '/' + self._config.daemon + '.conf /etc/init/', done );
		}
	], done );

};

Deploid.prototype._setupNodeAppCode = function( node, done ) {

	console.error( 'Setup source on node ' + node + '.' );

	var self = this;
	async.series( [
		function( done ) {
			self._runSshCmd( node, 'sudo rm -f /opt/apps/' + self._config.daemon + '/current', done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo ln -s ' + self._config.version + ' /opt/apps/' + self._config.daemon + '/current', done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo ls /opt/apps/' + self._config.daemon + '/ | grep -vE "' + self._config.version.replace( /\./g, '\\.' ) + '|current" | xargs -I \'{}\' sudo rm -rf /opt/apps/' + self._config.daemon + '/\'{}\'', done );
		}
	], done );

};

var scpCount = 0;
Deploid.prototype._scp = function( source, host, path, done ) {

	var self = this;
	var scpCmd = 'scp -rq -o StrictHostKeyChecking=no ';

	if ( self._config.sshKey ) {
		scpCmd += '-i ' + self._config.sshKey + ' ';
	}

	scpCmd += source + ' ';

	if ( self._config.sshUser ) {
		scpCmd += self._config.sshUser + '@' + host;
	} else {
		scpCmd += host;
	}

	scpCmd += ':' + path;

	//if ( self._config.debug ) {
	//	console.error( 'DEBUG', scpCmd );
	//}

	processExec( scpCmd, done );

};
var sshCmdCount = 0;
Deploid.prototype._runSshCmd = function( host, cmd, done ) {

	var self = this;
	var sshCmd = 'ssh -q -o StrictHostKeyChecking=no ';

	if ( self._config.sshKey ) {
		sshCmd += '-i ' + self._config.sshKey + ' ';
	}

	if ( self._config.sshUser ) {
		sshCmd += self._config.sshUser + '@' + host + ' ';
	} else {
		sshCmd += host + ' ';
	}

	sshCmd += '"' + cmd.replace( /"/g, '\\"' );

	var maxBuffer = 100 * 1024;
	if ( !self._config.debug ) {
		sshCmd += ' &> /dev/null';
	} else {
		maxBuffer = 10000 * 1024;
	}

	sshCmd += '"';

	sshCmdCount++;

	processExec( sshCmd, { maxBuffer: maxBuffer }, done );

};

Deploid.prototype._prepareTmpDir = function( done ) {

	console.error( 'Preparing tmp dir.' );

	this._tmpDir = new tmp.Dir().path.replace( /\/$/, '' ) + '/';
	this._tmpDirRemote = '/tmp/daemonixDeploy/' + this._tmpDir.replace( /^[^\/]*\//, '' ).replace( /\/$/, '' ) + '/';

	console.error( 'Prepared tmp dir.' );
	done();

};

Deploid.prototype._prepareNvmDir = function( done ) {

	console.error( 'Preparing NVM directory.' );

	async.series( [
		function( done ) {
			processExec( 'git clone https://github.com/creationix/nvm.git /tmp/nvm.tmp', function( err, stdOut, stdErr ) {

				if ( err && !stdErr.match( /already exists and is not an empty directory/ ) ) {
					done( err );
					return;
				}

				done();

			} );
		},
		function( done ) {
			processExec( 'git pull', { cwd: '/tmp/nvm.tmp' }, done );
		}
	], function( err ) {

		if ( err ) {
			done( err );
			return;
		}

		console.error( 'Prepared NVM directory.' );

		done();

	} );

};

Deploid.prototype._prepareSrcDir = function( done ) {

	console.error( 'Preparing source directory.' );

	var self = this;
	var isGit = null;
	var isCorrectSrc = false;

	var clearSrc = function( done ) {

		self._config.srcDir = self._config.srcDir || '';
		self._config.srcDir = self._config.srcDir.trim();

		if ( self._config.srcDir.length < 2 ) {
			done( 'srcDir invalid' );
			return;
		}

		async.series( [
			function( done ) {
				processExec( 'rm -rf ' + self._config.srcDir, done );
			},
			function( done ) {
				processExec( 'mkdir ' + self._config.srcDir, done );
			}
		], done );

	};

	async.series( [
		function( done ) {
			fs.realpath( self._config.srcDir, function( err, realPath ) {

				if ( err || realPath === '/' ) {
					done( 'srcDir is not a valid realPath: ' + realPath );
					return;
				}

				self._config.srcDir = realPath;

				done();
			} );
		},
		function( done ) {

			console.error( 'Verifying source directory Git checkout.' );

			processExec( 'git status', { cwd: self._config.srcDir }, function( err ) {

				if ( err ) {
					isGit = false;
					console.error( 'Source directory is not a Git checkout.' );
					clearSrc( function() {
						done();
					} );
				} else {
					isGit = true;
					done();
				}

			} );

		},
		function( done ) {

			if ( isGit === true ) {

				processExec( 'git config --get remote.origin.url', { cwd: self._config.srcDir }, function( err, stdout ) {

					if ( !stdout && !err ) {
						err = 'no git remote url';
					}

					if ( err ) {
						done( err );
						return;
					}

					stdout = stdout.trim();

					isCorrectSrc = (stdout === self._config.source);

					if ( !isCorrectSrc ) {
						console.error( 'Source directory is not a clone of ' + self._config.source + '.' );
					}

					done();

				} );

				return;
			}

			isCorrectSrc = false;
			done();

		},
		function( done ) {

			if ( isCorrectSrc === true ) {
				done();
				return;
			}

			console.error( 'Cloning ' + self._config.source + ' into source dir.' );

			clearSrc( function() {
				processExec( 'git clone ' + self._config.source + ' ' + self._config.srcDir, function( err ) {
					if ( err ) {
						done( err );
					} else {
						done();
					}
				} );

			} );

		},
		function( done ) {

			console.error( 'Git pull remote commits.' );

			processExec( 'git pull --all', { cwd: self._config.srcDir }, function( err ) {
				if ( err ) {
					done( err );
				} else {
					console.error( 'Verified source directory Git checkout.' );
					done();
				}
			} );
		}
	], function( err ) {

		if ( err ) {
			done( err );
			return;
		}

		console.error( 'Prepared source directory.' );

		done();

	} );

};

Deploid.prototype._rmdir = function( path, done ) {

	path = path || '';
	path = path.trim();

	async.series( [
		function( done ) {
			fs.realpath( path, function( err, realpath ) {

				if ( err ) {
					done( err );
					return;
				}

				if ( realpath.length < 2 ) {
					done( new Error( 'path is invalid' ) );
					return;
				}

				path = realpath;
				done();

			} );
		},
		function( done ) {
			processExec( 'rm -rf ' + path, done );
		}
	], done );

};

function getPackageFile( packageFile, done ) {

	fs.readFile( packageFile, { encoding: 'utf8' }, function( err, data ) {

		if ( typeof data !== 'string' ) {
			err = new Error( 'could not get file data' );
		}

		if ( err ) {
			done( err );
			return;
		}

		try {
			data = JSON.parse( data );
		} catch ( e ) {
			done( e );
			return;
		}

		if ( data ) {
			done( null, data );
		} else {
			done( new Error( 'package.json missing data' ) );
		}

	} );
}

function getNodeVersion( packageFile, done ) {

	if ( packageFile && packageFile.engines && packageFile.engines.node ) {
		var nodeVersion = packageFile.engines.node;

		// convert dynamic version numbers to something NVM can understand
		if ( nodeVersion.match( />=|~/ ) ) {
			nodeVersion = nodeVersion.replace( /^[^0-9]*/, '' ).replace( /\.[^\.]*$/, '' );
		}

		done( null, nodeVersion.replace( /\.x$/, '' ) );
	} else {
		done( new Error( 'package.json missing engines.node field' ) );
	}

}

module.exports = Deploid;
