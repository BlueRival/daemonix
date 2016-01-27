#!/bin/bash

# don't let other nvm installs pollute this one
unset NVM_PATH
unset NVM_DIR
unset NVM_NODEJS_ORG_MIRROR
unset NODE_PATH
unset NVM_BIN

nodeVersion="${2}"
export NVM_DIR="${1}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install $nodeVersion
which node
