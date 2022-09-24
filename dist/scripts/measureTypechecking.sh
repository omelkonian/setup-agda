#!/bin/bash
shopt -s globstar
agdaCmd=$1 && shift
out=$1 && shift

function displayTimeDiff {
  diff=$(($1 - $2))
  echo "$(($diff / 60))m$(($diff % 60))s"
}

start=$(date +%s)
rm -rf _build/
$agdaCmd
end=$(date +%s)
echo "Writing individual times to: $out..."
echo "TOTAL: $(displayTimeDiff $end $start)" > $out
is=$(ls -hltr --full-time _build/**/*.agdai | awk '{
  printf("%s>%s %s\n", $9, $6, $7)
}')
cur=$start
while IFS= read -r i; do
  f=`echo $i | cut -d'>' -f1 | cut -d'/' -f4- | cut -d'.' -f1`
  tv=`echo $i | cut -d'>' -f2`
  t=`date "+%s" -d "$tv"`
  echo "$f: $(displayTimeDiff $t $cur)" >> $out
  cur=$t
done <<< "$is"