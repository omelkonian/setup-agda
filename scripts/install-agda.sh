#!/bin/bash

H=$1
AGDA=$2
STDLIB=$3
GHC='8.6.5'
    
# Install Agda
curl -L https://github.com/agda/agda/archive/v$AGDA.zip -o $H/agda-$AGDA.zip
unzip -qq $H/agda-$AGDA.zip -d $H
cd $H/agda-$AGDA
stack install --stack-yaml=stack-$GHC.yaml

# Install Agda's stdlib
curl -L https://github.com/agda/agda-stdlib/archive/v$STDLIB.zip -o $H/agda-stdlib-$STDLIB.zip
unzip -qq $H/agda-stdlib-$STDLIB.zip -d $H
