"use strict";

var async = require( 'async' );
var fs = require( 'fs' );
var childProcess = require( 'child_process' );
var tmp = require( 'temporary' );

var Deploid = function( config ) {

	this._config = config;

	if ( !config.hasOwnProperty( 'user' ) ) {
		config.user = config.name;
	}

	if ( !config.hasOwnProperty( 'daemon' ) ) {
		config.daemon = config.name;
	}

	console.error( 'CONFIG', config );

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

	if ( this._tmpDir ) {
		this._rmdir( this._tmpDir.path, done );
		done();
	}

};

Deploid.prototype._buildPackage = function( done ) {

	var self = this;
	var cacheFile = self._packageCacheFile = self._config.packageDir + '/' + self._config.env + '.' + self._config.version + '.tar.gz';

	var buildCacheEntry = function() {

		console.error( 'Building package.' );

		var tmpDir = self._tmpDir.path + '/' + self._config.version;
		var tmpSrcDir = tmpDir + '/src';
		var tmpNvmDir = tmpDir + '/nvm';
		var tmpUpstartConf = tmpDir + '/' + self._config.daemon + '.conf';

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
				childProcess.exec( 'rsync -avzr ' + self._config.srcDir.replace( /\/$/, '' ) + '/ ' + tmpSrcDir, done );
			},
			function( done ) {
				console.error( 'Checking out ' + self._config.version + '.' );
				childProcess.exec( 'git checkout ' + self._config.version, { cwd: tmpSrcDir }, done );
			},
			function( done ) {
				getNodeVersion( tmpSrcDir + '/package.json', function( err, nodeVersion ) {
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
				console.error( 'Performing npm installation.' );
				childProcess.exec( 'npm install --production', { cwd: tmpSrcDir  }, done );
			},
			function( done ) {
				console.error( 'Performing npm build.' );
				childProcess.exec( 'npm run-script build', { cwd: tmpSrcDir  }, done );
			},
			function( done ) {
				console.error( 'Copying NVM src.' );
				childProcess.exec( 'rsync -avzr /tmp/nvm.tmp/ ' + tmpNvmDir, done );
			},
			function( done ) {
				console.error( 'Installing node version ' + self._config.nodeVersion + ' in NVM.' );
				childProcess.exec( __dirname + '/nvmSetup.sh ' + tmpNvmDir + ' ' + self._config.nodeVersion, function( err ) {

					if ( err ) {
						done( err );
						return;
					}

					done();
				} );
			},
			function( done ) {
				fs.readdir( tmpNvmDir, function( err, files ) {
					if ( err ) {
						done( err );
						return;
					}

					var newNodeVersion = null;
					for ( var i = 0; i < files.length && newNodeVersion === null; i++ ) {
						var match = files[i].match( /^v([0-9]+\.[0-9]+\.[0-9]+)$/ );
						if ( match ) {
							newNodeVersion = match[1];
						}
					}

					if ( newNodeVersion === null ) {
						done( 'failed to find node installation in NVM' );
						return;
					}

					self._config.nodeVersion = newNodeVersion;

					done();
				} );
			},
			function( done ) {
				self._createUpstartConfFile( tmpUpstartConf, done );
			},
			function( done ) {
				console.error( 'Boxing up package.' );
				childProcess.exec( 'tar -cz ' + self._config.version + ' >| ' + self._config.version + '.tar.gz', { cwd: self._tmpDir.path }, done );
			},
			function( done ) {
				console.error( 'Caching package.' );
				fs.rename( self._tmpDir.path + '/' + self._config.version + '.tar.gz', cacheFile, done );
			}
		], function( err ) {

			if ( err ) {
				done( err );
				return;
			}

			console.error( 'Built package.' );

			done();
		} );

	};

	fs.exists( cacheFile, function( exists ) {
		if ( exists ) {
			console.error( 'Using cached package.' );
			done();
		} else {
			buildCacheEntry();
		}
	} );

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

				for ( var field in self._config ) {
					if ( self._config.hasOwnProperty( field ) ) {
						var regEx = new RegExp( '\\{\\{' + field + '\\}\\}', 'g' );
						data = data.replace( regEx, self._config[field] );
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

	var packageFile = self._packageCacheFile.replace( /^.*\//, '' );

	console.error( 'Sending package to ' + node + '.' );
	async.series( [
		function( done ) {
			self._scp( self._packageCacheFile, node, '/tmp', done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo rm -rf ' + self._config.version, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo tar -xzf /tmp/' + packageFile, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo rm -rf /tmp/' + packageFile, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo mkdir -p /opt/apps/' + self._config.daemon, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo service ' + self._config.daemon + ' stop', function( err, stdout, stderr ) {

				if ( err && ( !stderr || !stderr.match( /unrecognized service/ ) ) ) {
					done( err );
					return;
				}

				done();

			} );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo rm -rf /opt/apps/' + self._config.daemon + '/' + self._config.version, done );
		},
		function( done ) {
			self._runSshCmd( node, 'sudo mv ' + self._config.version + ' /opt/apps/' + self._config.daemon, done );
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

				if ( err ) {
					done( err );
					return;
				}

				done();
			} );

		},
		function( done ) {

			self._runSshCmd( node, 'sudo addgroup --system ' + self._config.user, function( err ) {

				if ( err ) {
					done( err );
					return;
				}

				done();
			} );

		},
		function( done ) {

			self._runSshCmd( node, 'sudo usermod -g ' + self._config.user + ' ' + self._config.user, function( err ) {

				if ( err ) {
					done( err );
					return;
				}

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
		}
	], done );

};

var scpCount = 0;
Deploid.prototype._scp = function( source, host, path, done ) {

	var self = this;
	var scpCmd = 'scp -r -o StrictHostKeyChecking=no ';

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

//	console.error( 'SCP command', scpCmd );

	childProcess.exec( scpCmd, done );

};
var sshCmdCount = 0;
Deploid.prototype._runSshCmd = function( host, cmd, done ) {

	var self = this;
	var sshCmd = 'ssh -o StrictHostKeyChecking=no ';

	if ( self._config.sshKey ) {
		sshCmd += '-i ' + self._config.sshKey + ' ';
	}

	if ( self._config.sshUser ) {
		sshCmd += self._config.sshUser + '@' + host + ' ';
	} else {
		sshCmd += host + ' ';
	}

	sshCmd += cmd;

	sshCmdCount++;

//	console.error( 'SSH command', sshCmdCount, sshCmd );
	childProcess.exec( sshCmd, function( err, stdout, stderr ) {
//		console.error( 'SSH result', sshCmdCount, err, stdout, stderr );
		done( err, stdout, stderr );
	} );

};

Deploid.prototype._prepareTmpDir = function( done ) {

	console.error( 'Preparing tmp dir.' );

	this._tmpDir = new tmp.Dir();

	console.error( 'Prepared tmp dir.' );

	done();
};

Deploid.prototype._prepareNvmDir = function( done ) {

	console.error( 'Preparing NVM directory.' );

	async.series( [
		function( done ) {
			childProcess.exec( 'git clone https://github.com/creationix/nvm.git /tmp/nvm.tmp', function( err, stdOut, stdErr ) {

				if ( err && !stdErr.match( /already exists and is not an empty directory/ ) ) {
					done( err );
					return;
				}

				done();

			} );
		},
		function( done ) {
			childProcess.exec( 'git pull', { cwd: '/tmp/nvm.tmp' }, done );
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
				childProcess.exec( 'rm -rf ' + self._config.srcDir, done );
			},
			function( done ) {
				childProcess.exec( 'mkdir ' + self._config.srcDir, done );
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

			childProcess.exec( 'git status', { cwd: self._config.srcDir }, function( err ) {

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

				childProcess.exec( 'git config --get remote.origin.url', { cwd: self._config.srcDir }, function( err, stdout ) {

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
				childProcess.exec( 'git clone ' + self._config.source + ' ' + self._config.srcDir, function( err ) {
					if ( err ) {
						done( err );
					} else {
						done();
					}
				} );

			} );

		},
		function( done ) {

			console.error( 'Git checkout master.' );

			childProcess.exec( 'git checkout master', { cwd: self._config.srcDir }, function( err ) {
				if ( err ) {
					done( err );
				} else {
					done();
				}
			} );
		},
		function( done ) {

			console.error( 'Git pull remote commits.' );

			childProcess.exec( 'git pull', { cwd: self._config.srcDir }, function( err ) {
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
					done( 'path is invalid' );
					return;
				}

				path = realpath;
				done();

			} );
		},
		function( done ) {
			childProcess.exec( 'rm -rf ' + path, done );
		}
	], done );

};

function getNodeVersion( packageFile, done ) {

	var nodeVersion = null;

	fs.readFile( packageFile, { encoding: 'utf8' }, function( err, data ) {

		if ( typeof data !== 'string' ) {
			err = 'could not get file data';
		}

		if ( err ) {
			done( err );
			return;
		}

		data = JSON.parse( data );

		if ( data && data.engines && data.engines.node ) {
			nodeVersion = data.engines.node;

			// convert dynamic version numbers to something NVM can understand
			if ( nodeVersion.match( />=|~/ ) ) {
				nodeVersion = nodeVersion.replace( /^[^0-9]*/, '' ).replace( /\.[^\.]*$/, '' );
			}
			nodeVersion = nodeVersion.replace( /\.x$/, '' );

			done( null, nodeVersion );
		} else {
			done( 'package.json missing engines.node field' );
		}

	} );
}


module.exports = Deploid;
