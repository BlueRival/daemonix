#!/bin/bash

# don't let other nvm installs pollute this one
unset NVM_PATH
unset NVM_DIR
unset NVM_NODEJS_ORG_MIRROR
unset NODE_PATH
unset NVM_BIN

. $1/nvm.sh
nvm install $2
which node
