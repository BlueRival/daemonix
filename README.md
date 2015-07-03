daemonix
===

Daemonix is a tool for deploying and managing NodeJS systems as a daemon in Linux/Unix environments.

Were are targeting Ubuntu 12.04+ for our initial release but other distros will come online eventually. No, we will never try to make this work for Windows in any way shape or form.

Pronunciation: day-mon-icks

Basic Usage
===

The minimum to have daemonix manage your process is just this in your server.js.

```javascript

// You must specify an App class, that provides this interface
var App = function( env ) {
	// env is a string containing the environment you are in. It is up to your app to figure out how to pull down configs
};
App.prototype.init = function(done) {
	// done should be called after the app is finished being initialized, opening
	// web application ports, creating other resources, etc.
	// if you pull in your configs dynamically, this would be the place to do it and then start loading dependencies
	setImmediate(done, null);
};
App.prototype.dinit = function(done) {
  // done should be called when app is finished being de-initialized, closing
  // web servers, etc.
	setImmediate(done, null);
};

var daemonix = require( 'daemonix' )( { app: App } );

```

With this code, Daemonix will automatically spin up two worker processes, and manage the worker's presence. If the workers die for any reason, Daemonix will restart it. This minimizes the need for utilities like forever.

If any worker dies, it will be restarted in 1000 ms. If the master process exits, then it will give each worker up to 30000 ms to call ```done()``` on ```dinit()```.

Advanced Usage
===

If you want to customize control, you can override any of the parameters like this.

```javascript

var daemonix = require( 'daemonix' )( {
  app: App
  workers: {
    count: [ int | 'auto'], // int > 0, specifies exact number of workers to use, auto will use one worker per CPU core. default: 2
    restartTimeout: [ int ], // number of milliseconds to wait before restarting a failed worker. default: 1000
    shutdownTimeout: [ int ] // number of milliseconds to wait on app.dinit(done); to call done(null) before the worker is killed. default: 30000
} );

```

Extra Advanced Usage
===

Daemonix is also a deploy tool. Currently it works on Ubuntu (and maybe any other Upstart based distro). But, we are working on other Linux distros now. No, don't old your breath for Windows. That will never happen.
 
To deploy with Daemonix you need the following:

- Ubuntu servers to deploy to. Each server should have a user with an SSH key for password-less login, and be able to sudo without a password. 
- The deployment server must have Node installed, a git client (and SSH keys for any git repos requiring auth you want to reference) and all other global build tools your apps may use (grunt-cli, nib, etc.)
- Then, install Daemonix: npm -g install daemonix
- Run daemonix --help to see what it can do.

Yes, we need more details on these things, but at a high level Daemonix will:

- Let you add an app with a corresponding git repo
- Let you define environments for the app (production, staging, production-api, production-workers, qa1, qa2, etc). Each environment allows you to specify hosts to deploy to, alternative name for the daemon the app will run under (default is app name), and some others.
- Let you add/remove nodes (Linux servers you deploy to) from an environment. 
- Let you do more.

Notes:

The CLI tool will create a directory ~/.daemonix. In there it caches built packages and stores all the app configs in easy to ready JSON files. Feel free to poke around, I think you could figure it out.

When doing a deploy, run it with the debug flag, it will output every command daemonix is issuing to build, package and deploy your application.

Has been tested with NodeJS versions 0.10 and 0.12, and Ubuntu 14.04 LTS (Derivatives probably work too, Mint, Lubuntu, Kubuntu, etc).

Contribute
===

If you want to contribute, feel free to. Fork the repo on GitHub, make a feature branch of the format 'feature/feature-name-here', and get to work! 

Some things we need:

- Automated testing, with Mocha please. Automating this is nasty as you need a target node to deploy to.
- Support for RedHat, CentOS and Fedora
- Support for Suse
- Support for Solaris
- Support for BSD
- Support for any other Unix target you can think of
- Some refactoring. Things are a little cramped
- A service for allowing build servers to issues commands and get status on deployments, etc

Some things we don't need:

- Indentation with spaces. If you find it, and commit a fix with only white space enhancements, bravo!
- Comma first array definitions 
- Omitting braces on code blocks
- CoffeeScript
- Variable version numbers in package.json. Lock them down.
- Back talk. Present your case with logic and you will be heard. Present it with attitude and we will hug you until you cry and hug us back.

When in doubt, format your code like you are writing good ole C. 
