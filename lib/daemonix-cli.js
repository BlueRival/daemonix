"use strict";

var Command = require( 'commander' ).Command;
var Deploid = require( './deploid' );
var fs = require( 'fs' );
var inquirer = require( 'inquirer' );
var mkdirp = require( 'mkdirp' );

var packageInfo = JSON.parse( fs.readFileSync( __dirname + '/../package.json', { encoding: 'utf8' } ) );

var DaemonixCli = function() {

	var self = this;

	self._program = new Command( packageInfo.name );
	self._program
		.version( packageInfo.version )
		.description( packageInfo.description );

	self._program
		.command( 'addApp <name> <source>' )
		.description( 'Adds an application to the deployment repository from Git source.' )
		.action( function( appName, source ) {
			self.addApp( appName, source, function( err ) {
				if ( err ) {
					console.error( err );
					process.exit( 1 );
				} else {
					self.getApp( appName, function( data ) {
						console.log( JSON.stringify( data, null, 4 ) );
					} );
				}
			} );
		} );

	self._program
		.command( 'listApp <name>' )
		.description( 'Show the current configuration for an application in the deployment repository.' )
		.action( function( appName ) {
			self.getApp( appName, function( data ) {
				console.log( JSON.stringify( data, null, 4 ) );
			} );
		} );

	self._program
		.command( 'removeApp <name>' )
		.description( 'Remove an application in the deployment repository.' )
		.action( function( appName ) {
			self.removeApp( appName, function( err ) {
				if ( err ) {
					console.error( err );
					process.exit( 1 );
				} else {
					console.log( 'success' );
				}
			} );
		} );

	self._program
		.command( 'renameApp <name> <newName>' )
		.description( 'Rename an application in the deployment repository.' )
		.action( function( oldAppName, newAppName ) {
			self.renameApp( oldAppName, newAppName, function( err ) {
				if ( err ) {
					console.error( err );
					process.exit( 1 );
				} else {
					console.log( 'success' );
				}
			} );
		} );

	self._program
		.command( 'addEnv <app> <name>' )
		.option( '--user <user>', 'An alternate username for the app in the specified environment. Default user is same as app name.' )
		.option( '--daemon <daemon>', 'An alternate daemon name for the app in the specified environment. Default is same as app name.' )
		.option( '--sshKey <sshKey>', 'The path to the SSH key to use for authentication for remote operations.' )
		.option( '--sshUser <sshUser>', 'The SSH user to use for remote operations. This user must be able to run sudo commands without a password prompt.' )
		.option( '--loggingMode <loggingMode>', 'The mode for logging. By default, the mode is \'pipe\', which  means stdout and stderr are piped into the log file. You can also set \'file\' which means that the NODE_LOG env var will be set to the file name, and it is up to the application to log to it.' )
		.description( 'Add a target deployment environment for an application already in the repository.' )
		.action( function( appName, envName, program ) {

			self.addEnv( appName, envName, program.user || null, program.daemon || null, program.sshKey || null, program.sshUser || null, program.loggingMode || null, function( err ) {
				if ( err ) {
					console.error( err );
					process.exit( 1 );
				} else {
					self.getApp( appName, function( data ) {
						console.log( JSON.stringify( data, null, 4 ) );
					} );
				}
			} );

		} );

	self._program
		.command( 'removeEnv <app> <name>' )
		.description( 'Remove a target deployment environment for an application already in the repository.' )
		.action( function( appName, envName ) {

			self.removeEnv( appName, envName, function( err ) {
				if ( err ) {
					console.error( err );
					process.exit( 1 );
				} else {
					self.getApp( appName, function( data ) {
						console.log( JSON.stringify( data, null, 4 ) );
					} );
				}
			} );

		} );

	self._program
		.command( 'addEnvNodes <app> <name> <nodes>' )
		.description( 'Add target deployment nodes (comma separated list of FQDNs or IPs) for the specified environment for an application already in the repository.' )
		.action( function( appName, envName, nodes ) {

			nodes = nodes.split( /,/ );

			self.addEnvNodes( appName, envName, nodes, function( err ) {
				if ( err ) {
					console.error( err );
					process.exit( 1 );
				} else {
					self.getApp( appName, function( data ) {
						console.log( JSON.stringify( data, null, 4 ) );
					} );
				}
			} );

		} );

	self._program
		.command( 'removeEnvNodes <app> <name> <nodes>' )
		.description( 'Add target deployment nodes (comma separated list of FQDNs or IPs) for the specified environment for an application already in the repository.' )
		.action( function( appName, envName, nodes ) {

			nodes = nodes.split( /,/ );

			self.removeEnvNodes( appName, envName, nodes, function( err ) {
				if ( err ) {
					console.error( err );
					process.exit( 1 );
				} else {
					self.getApp( appName, function( data ) {
						console.log( JSON.stringify( data, null, 4 ) );
					} );
				}
			} );

		} );

	self._program
		.command( 'deploy <app> <env> <version>' )
		.option( '-y, --yes', 'Do not prompt for approval before deploying.' )
		.option( '--forceRebuild', 'Force rebuild package.' )
		.option( '--debug', 'Show all SSH commands run on server.' )
		.description( 'Add target deployment nodes (comma separated list of FQDNs or IPs) for the specified environment for an application already in the repository.' )
		.action( function( appName, envName, version, program ) {

			self.deploy( appName, envName, version, program.yes || false, program.forceRebuild || false, program.debug || false, function( err ) {
				if ( err ) {
					console.error( err );
					process.exit( 1 );
				}
			} );

		} );


};

DaemonixCli.prototype.run = function() {

	this._program.parse( process.argv );

};

DaemonixCli.prototype.deploy = function( appName, envName, version, yes, forceRebuild, debug, done ) {

	var self = this;
	self._readApp( appName, function( app ) {

		if ( !app.hasOwnProperty( 'name' ) || !app.hasOwnProperty( 'source' ) ) {
			done( 'Application ' + appName + ' does not exist in the repository' );
			return;
		}

		if ( !app.hasOwnProperty( 'env' ) ) {
			app.env = {};
		}

		if ( !app.env.hasOwnProperty( envName ) ) {
			done( 'Environment ' + envName + ' does not exist for the application ' + appName );
			return;
		}

		if ( app.env[envName].length < 1 ) {
			done( 'Environment ' + envName + ' has no deployment nodes for the application ' + appName );
			return;
		}

		var config = {
			name: appName,
			version: version,
			source: app.source,
			env: envName,
			nodes: app.env[envName].nodes,
			forceRebuild: forceRebuild,
			debug: debug
		};

		var optionalField = [
			'user',
			'daemon',
			'sshKey',
			'sshUser',
			'loggingMode'
		];

		optionalField.forEach( function( field ) {
			if ( app.env[envName].hasOwnProperty( field ) ) {
				config[field] = app.env[envName][field];
			}
		} );

		console.log( "Deployment configuration:\n\n" + JSON.stringify( config, null, 4 ) + "\n" );

		if ( yes ) {
			self._execDeploy( config, done );
		} else {
			inquirer.prompt( [
				{
					name: 'confirm',
					message: 'Are you sure you want to deploy the above configuration?',
					default: false,
					type: 'confirm'
				}
			], function( response ) {

				if ( response.confirm ) {
					self._execDeploy( config, done );
				} else {
					done( 'Aborted' );
				}

			} );
		}

	} );

};

DaemonixCli.prototype._execDeploy = function( config, done ) {

	var self = this;
	self._getConfigDir( 'deploy/' + config.name + '/src', function( srcDir ) {
		self._getConfigDir( 'deploy/' + config.name + '/packages', function( packageDir ) {

			if ( !srcDir ) {
				done( 'failed to get src directory' );
				return;
			}

			if ( !packageDir ) {
				done( 'failed to get package directory' );
				return;
			}

			config.srcDir = srcDir;
			config.packageDir = packageDir;

			var deploid = new Deploid( config );

			deploid.execute( done );

		} );
	} );


};

DaemonixCli.prototype.addEnvNodes = function( appName, envName, nodes, done ) {

	var self = this;
	self._readApp( appName, function( app ) {

		if ( !app.hasOwnProperty( 'name' ) || !app.hasOwnProperty( 'source' ) ) {
			done( 'Application ' + appName + ' does not exist in the repository' );
			return;
		}


		if ( !app.hasOwnProperty( 'env' ) ) {
			app.env = {};
		}

		if ( !app.env.hasOwnProperty( envName ) ) {
			done( 'Environment ' + envName + ' does not exist for the application ' + appName );
			return;
		}

		nodes.forEach( function( node ) {
			if ( app.env[envName].nodes.indexOf( node ) < 0 ) {
				app.env[envName].nodes.push( node );
			}
		} );

		self._writeApp( appName, app, done );

	} );

};

DaemonixCli.prototype.removeEnvNodes = function( appName, envName, nodes, done ) {

	var self = this;
	self._readApp( appName, function( app ) {

		if ( !app.hasOwnProperty( 'name' ) || !app.hasOwnProperty( 'source' ) ) {
			done( 'Application ' + appName + ' does not exist in the repository' );
			return;
		}

		if ( !app.hasOwnProperty( 'env' ) ) {
			app.env = {};
		}

		if ( !app.env.hasOwnProperty( envName ) ) {
			done( 'Environment ' + envName + ' does not exist for the application ' + appName );
			return;
		}

		nodes.forEach( function( node ) {
			var index = app.env[envName].nodes.indexOf( node );

			if ( index > -1 ) {
				app.env[envName].nodes.splice( index, 1 );
			}
		} );

		self._writeApp( appName, app, done );

	} );

};

DaemonixCli.prototype.addEnv = function( appName, envName, user, daemon, sshKey, sshUser, loggingMode, done ) {

	var self = this;
	self._readApp( appName, function( app ) {

		if ( !app.hasOwnProperty( 'name' ) || !app.hasOwnProperty( 'source' ) ) {
			done( 'Application ' + appName + ' does not exist in the repository' );
			return;
		}

		if ( !app.hasOwnProperty( 'env' ) ) {
			app.env = {};
		}

		if ( !app.env.hasOwnProperty( envName ) ) {
			app.env[envName] = {};
		}

		if ( user && user !== appName ) {
			app.env[envName].user = user;
		} else if ( app.env[envName].hasOwnProperty( 'user' ) ) {
			delete app.env[envName].user;
		}

		if ( daemon && daemon !== appName ) {
			app.env[envName].daemon = daemon;
		} else if ( app.env[envName].hasOwnProperty( 'daemon' ) ) {
			delete app.env[envName].daemon;
		}

		if ( sshKey ) {
			app.env[envName].sshKey = sshKey;
		} else if ( app.env[envName].hasOwnProperty( 'sshKey' ) ) {
			delete app.env[envName].sshKey;
		}

		if ( sshUser ) {
			app.env[envName].sshUser = sshUser;
		} else if ( app.env[envName].hasOwnProperty( 'sshUser' ) ) {
			delete app.env[envName].sshUser;
		}

		if ( loggingMode ) {
			app.env[envName].loggingMode = loggingMode;
		} else if ( app.env[envName].hasOwnProperty( 'loggingMode' ) ) {
			delete app.env[envName].loggingMode;
		}

		if ( !Array.isArray( app.env[envName].nodes ) ) {
			app.env[envName].nodes = [];
		}

		self._writeApp( appName, app, done );

	} );

};

DaemonixCli.prototype.removeEnv = function( appName, envName, done ) {

	var self = this;
	self._readApp( appName, function( app ) {

		if ( !app.hasOwnProperty( 'name' ) || !app.hasOwnProperty( 'source' ) ) {
			done( 'Application ' + appName + ' does not exist in the repository' );
			return;
		}

		if ( !app.hasOwnProperty( 'env' ) ) {
			app.env = {};
		}

		if ( app.env.hasOwnProperty( envName ) ) {
			delete app.env[envName];
		}

		self._writeApp( appName, app, done );

	} );

};

DaemonixCli.prototype.getApp = function( name, done ) {

	this._readApp( name, done );

};

DaemonixCli.prototype.removeApp = function( appName, done ) {

	this._deleteApp( appName, done );

};

DaemonixCli.prototype.renameApp = function( oldAppName, newAppName, done ) {

	this._renameApp( oldAppName, newAppName, done );

};

DaemonixCli.prototype.addApp = function( name, source, done ) {

	var self = this;

	self._readApp( name, function( app ) {
		app.name = name;
		app.source = source;

		self._writeApp( name, app, done );

	} );

};

DaemonixCli.prototype._deleteApp = function( name, done ) {

	var self = this;
	self._getConfigDir( 'apps', function( dir ) {
		if ( dir ) {
			fs.unlink( dir + '/' + name + '.json', done );
		} else {
			done( {} );
		}
	} );

};

DaemonixCli.prototype._renameApp = function( name, newName, done ) {

	var self = this;
	self._getConfigDir( 'apps', function( dir ) {

		if ( dir ) {
			fs.rename( dir + '/' + name + '.json', dir + '/' + newName +'.json', function( err ) {
				if( err ) {
					done( name + ' does not exit' );
					return;
				}

				self._readApp( newName, function( app ) {
					if ( app.hasOwnProperty( 'name' ) ) {
						app.name = newName;

						self._writeApp( newName, app, function( err ) {
							if( err ){
								done( err );
							} else{
								done( app )
							}
						} );
					} else {
						done( name + ' does not have a name property' )
					}
				} )
			} );
		} else {
			done( 'Config directory does not exit' );
		}
	} );

};

DaemonixCli.prototype._readApp = function( name, done ) {

	var self = this;
	self._getConfigDir( 'apps', function( dir ) {
		if ( dir ) {
			self._readFile( dir + '/' + name + '.json', done );
		} else {
			done( {} );
		}
	} );

};

DaemonixCli.prototype._writeApp = function( name, data, done ) {

	var self = this;
	self._getConfigDir( 'apps', function( dir ) {
		if ( dir ) {
			self._writeFile( dir + '/' + name + '.json', data, function( err ) {
				if ( err ) {
					done( 'failed to write file: ' + dir + '/config.json' );
				} else {
					done();
				}
			} );
		} else {
			done( 'failed to acquire directory: apps/' + name );
		}
	} );

};

DaemonixCli.prototype._writeFile = function( path, data, done ) {

	var self = this;

	var dir = path.replace( /\/[^\/]*$/, '' );

	self._mkdirp( dir, function( success ) {
		if ( success ) {
			fs.writeFile( path, JSON.stringify( data, null, 4 ), function( err ) {
				if ( err ) {
					done( 'failed to write file: ' + err );
				} else {
					done();
				}
			} );
		} else {
			done( 'failed to get directory: ' + dir );
		}
	} );

};

DaemonixCli.prototype._readFile = function( path, done ) {

	fs.exists( path, function( exists ) {
		if ( exists ) {
			fs.readFile( path, { encoding: 'utf8' }, function( err, data ) {
				if ( data ) {
					done( JSON.parse( data ) );
				} else {
					done( {} );
				}
			} );
		} else {
			done( {} );
		}
	} );

};

DaemonixCli.prototype._getConfigDir = function( path, done ) {

	if ( typeof path === 'function' ) {
		done = path;
		path = '';
	} else if ( typeof path === 'string' ) {

		path = path.replace( /^\//, '' );

		if ( path.length > 0 ) {
			path = '/' + path;
		}
	}

	if ( typeof done !== 'function' ) {
		done = function() {
			// NO-OP
		};
	}

	this._mkdirp( (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.daemonix' + path, done );

};

DaemonixCli.prototype._mkdirp = function( dir, done ) {

	fs.exists( dir, function( exists ) {
		if ( exists ) {
			done( dir );
		} else {
			mkdirp( dir, function( err ) {
				if ( err ) {
					done( null );
				} else {
					done( dir );
				}
			} );
		}
	} );

};


module.exports = DaemonixCli;
