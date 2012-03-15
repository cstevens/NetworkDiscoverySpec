// XXX untested
//  - needs a configuration to say where to attach the ToC if there is no #sotd or #abstract
define(
    [],
    function () {
        return {
            run:    function (conf, doc, cb) {
                progress("fixing headers");
                var $secs = $("section", doc)
                    .find("h1:first, h2:first, h3:first, h4:first, h5:first, h6:first");
                if (!$secs.length) { cb(); return; }
                $secs.each(function () {
                    var depth = $(this).parents("section").length + 1;
                    if (depth > 6) depth = 6;
                    var h = "h" + depth;
                    if (this.localName.toLowerCase() != h) {
                        $(this).renameElement(h);
                    }
                });

                // makeTOC
                var $ul = this.makeTOCAtLevel($("body", doc), doc, [0], 1);
                if (!$ul) return;
                var $sec = $("<section id='toc'/>").append("<h2 class='introductory'>Table of Contents</h2>")
                                                   .append($ul);
                var $ref = $("#sotd");
                if (!$ref.length) $ref = $("#abstract", doc);
                $ref.after($sec);

                // Update all anchors with empty content that reference a section ID
                var secMap = this.secMap;
                $("a[href]:not(.tocxref)", doc).each(function (i, anchor) {
                    var $a = $(anchor, doc)
                    var id = $a.attr("href").slice(1);   // remove '#' from '#id'
                    if (secMap[id]) {
                        $a.addClass('sec-ref');

                        if ($a.html() == '') $a.html(secMap[id]);
                    }
                });
                
                cb();
            },

            secMap: {},
            appendixMode:   false,
            lastNonAppendix:    0,
            alphabet:   "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            makeTOCAtLevel:    function ($parent, doc, current, level) {
                // var $secs = $("section:not(.introductory)");
                var $secs = $parent.children("section:not(.introductory)");

                if ($secs.length == 0) return null;
                var $ul = $("<ul class='toc'></ul>");
                for (var i = 0; i < $secs.length; i++) {
                    var $sec = $($secs[i], doc);
                    if (!$sec.contents().length) continue;
                    var h = $sec.children()[0];
                    var ln = h.localName.toLowerCase();
                    if (ln != "h2" && ln != "h3" && ln != "h4" && ln != "h5" && ln != "h6") continue;
                    var title = h.textContent;
                    var $hKids = $(h, doc).contents().clone();
                    $hKids.find("a").renameElement("span").attr("class", "formerLink").removeAttr("href");
                    $hKids.find("dfn").renameElement("span").removeAttr("id");
                    var id = $sec.makeID(null, title);
                    
                    current[current.length-1]++;
                    var secnos = current.slice();
                    if ($sec.hasClass("appendix") && current.length == 1 && !this.appendixMode) {
                        this.lastNonAppendix = current[0];
                        this.appendixMode = true;
                    }
                    if (this.appendixMode) secnos[0] = this.alphabet.charAt(current[0] - this.lastNonAppendix);
                    var secno = secnos.join(".");
                    var isTopLevel = secnos.length == 1;
                    if (isTopLevel) {
                        secno = secno + ".";
                        // if this is a top level item, insert
                        // an OddPage comment so html2ps will correctly
                        // paginate the output
                        $(h, doc).before(document.createComment('OddPage'));
                    }
                    var $span = $("<span class='secno'></span>").text(secno + " ");
                    $(h, doc).prepend($span);

                    this.secMap[id] = "<span class='secno'>" + secno + "</span>" +
                                   "<span class='sec-title'>" + title + "</span>";

                    var $a = $("<a/>").attr({ href: "#" + id, 'class' : 'tocxref' })
                                      .append($span.clone())
                                      .append($hKids);
                    var $item = $("<li class='tocline'/>").append($a);
                    $ul.append($item);
                    if (this.maxTocLevel && level >= this.maxTocLevel) continue;
                    current.push(0);
                    var $sub = this.makeTOCAtLevel($sec, doc, current, level + 1);
                    if ($sub) $item.append($sub);
                    current.pop();
                }
                return $ul;
            },
            ieDummy: 1
        };
    }
);
