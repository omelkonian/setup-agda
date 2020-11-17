default: agda

GHC=8.6.5
AGDA=2.6.1
STDLIB=1.3
HTML_DIR=site
CSS=css/Agda.css

AGDA_LOC=$(HOME)/.local/bin/agda 
STDLIB_LOC=$(HOME)/agda-stdlib-$(STDLIB)/src
LIBS_LOC=$(HOME)/.agda
CSS_LOC=./$(HTML_DIR)/css

agda:
	mkdir -p $(LIBS_LOC)
	mkdir -p $(CSS_LOC)
	curl -L https://github.com/agda/agda/archive/v$(AGDA).zip -o $(HOME)/agda-$(AGDA).zip
	unzip -qq $(HOME)/agda-$(AGDA).zip -d $(HOME)
	cd $(HOME)/agda-$(AGDA) && stack install --stack-yaml=stack-$(GHC).yaml
	curl -L https://github.com/agda/agda-stdlib/archive/v$(STDLIB).zip -o $(HOME)/agda-stdlib-$(STDLIB).zip
	unzip -qq $(HOME)/agda-stdlib-$(STDLIB).zip -d $(HOME)
	echo "$(HOME)/agda-stdlib-$(STDLIB)/standard-library.agda-lib" >> $(LIBS_LOC)/libraries

lib: 
	curl -L https://github.com/$(USER)/$(REPO)/archive/master.zip -o $(HOME)/$(REPO)-master.zip
	unzip -qq $(HOME)/$(REPO)-master.zip -d $(HOME)
	echo "$(HOME)/$(REPO)-master/$(REPO).agda-lib" >> $(LIBS_LOC)/libraries

site:
	agda --html --html-dir=$(HTML_DIR) --css=$(CSS) $(MAIN).agda \
	  && cp $(HTML_DIR)/$(MAIN).html $(HTML_DIR)/index.html

.phony: agda lib site 