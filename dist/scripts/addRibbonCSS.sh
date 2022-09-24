#!/bin/bash
htmlDir=$1 && shift
ribbonColor=$1 && shift
repo=$1 && shift
curBranch=$1 && shift
ribbonMsg=$1 && shift

ribbonCss="<link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/github-fork-ribbon-css/0.2.3/gh-fork-ribbon.min.css'/>\
<style>.github-fork-ribbon:before { background-color: $ribbonColor; }</style>"

ribbon="<a class='github-fork-ribbon'\
href='https://github.com/$repo/tree/$curBranch/'\
data-ribbon='$ribbonMsg' title='$ribbonMsg'>$ribbonMsg</a>"

for f in $htmlDir/*.html; do
  sed -i -e "s%</title>%</title>$ribbonCss%g" -e "s%<body>%<body>$ribbon%g" "$f"
done