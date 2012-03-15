
define(
    [],
    function () {
        var proxyCache = {};
        window.addEventListener("message", function (ev) {
            var id = ev.data.substring(0, ev.data.indexOf(","));
            var data = ev.data.substring(ev.data.indexOf(",") + 1);
            if (data) proxyCache[id](data);
            else      proxyCache[id](null);
            $("#rs-ifr-" + id).remove();
        }, false);

        var utils = {
            // --- SET UP
            run:    function (conf, doc, cb) {
                // set up some configuration
                this.conf = conf;
                this.doc = doc;
                
                // shortcuts
                var self = this;
                shortcut.add("Ctrl+Shift+Alt+S", function () { self.showSaveOptions(); });
                shortcut.add("Esc", function () { self.hideSaveOptions(); });
                
                // jquery extras
                // XXX untested
                $.fn.renameElement = function (name) {
                    return this.each(function () {
                        var $newEl = $(this.ownerDocument.createElement(name));
                        // $newEl.attr($(this).attr());
                        for (var i = 0, n = this.attributes.length; i < n; i++) {
                            var at = this.attributes[i];
                            $newEl[0].setAttributeNS(at.namespaceURI, at.name, at.value);
                        }
                        $(this).contents().clone().appendTo($newEl);
                        $(this).replaceWith($newEl);
                    });
                };

                // XXX untested
                $.fn.makeID = function (pfx, txt) {
                    // doesn't work like a real jq plugin
                    var $el = $(this);
                    if ($el.attr("id")) return $el.attr("id");
                    var id = "";
                    if (!txt) {
                        if ($el.attr("title")) txt = $el.attr("title");
                        else                   txt = $el.text();
                    }

                    txt = txt.replace(/^\s+/, "").replace(/\s+$/, "");
                    id += txt;
                    id = id.toLowerCase();
                    id = id.split(/[^-.0-9a-z_]/).join("-").replace(/^-+/, "").replace(/-+$/, "");
                    if (id.length > 0 && /^[^a-z]/.test(id)) id = "x" + id;
                    if (id.length == 0) id = "generatedID";
                    if (pfx) id = pfx + "-" + id;
                    var inc = 1;
                    var doc = $el[0].ownerDocument;
                    if (doc.getElementById(id)) {
                        while (doc.getElementById(id + "-" + inc)) inc++;
                        id = id + "-" + inc;
                    }
                    $el.attr("id", id);
                    return id;
                };

                // XXX untested
                $.fn.dfnTitle = function () {
                    // doesn't work like a real jq plugin
                    var $dfn = $(this);
                    var title;
                    if ($dfn.attr("title")) title = $dfn.attr("title");
                    else if ($dfn.contents().length == 1 && $dfn.children("abbr, acronym").length == 1 &&
                             $dfn.find(":first-child").attr("title")) title = $dfn.find(":first-child").attr("title");
                    else title = $dfn.text();
                    title = utils.norm(title);
                    return title;
                };

                // XXX untested
                // Either append v in a space-separated-list style to attribute a, or create a new attribute
                $.fn.attrAppend = function (a, v) {
                    var val = $(this).attr(a);
                    val = val ? (val + ' ' + v) : v;
                    $(this).attr(a, val);
                    return this
                };  

                cb()
            },
            
            // --- DATE MANIPULATION --------------------------------------------------------------------------
            humanMonths: ["January", "February", "March", "April", "May", "June", "July",
                               "August", "September", "October", "November", "December"],

            parseSimpleDate:    function (str) {
                return new Date(str.substr(0, 4), (str.substr(5, 2) - 1), str.substr(8, 2));
            },

            parseLastModified:    function (str) {
                if (!str) return new Date();
                return new Date(Date.parse(str));
                // return new Date(str.substr(6, 4), (str.substr(0, 2) - 1), str.substr(3, 2));
            },

            humanDate:  function (date) {
                return this.lead0(date.getDate()) + " " + this.humanMonths[date.getMonth()] + " " + date.getFullYear();
            },

            concatDate: function (date, sep) {
                if (!sep) sep = "";
                return "" + date.getFullYear() + sep + this.lead0(date.getMonth() + 1) + sep + this.lead0(date.getDate());
            },

            lead0:  function (str) {
                str = "" + str;
                return (str.length == 1) ? "0" + str : str;
            },

            // --- STYLE HELPERS ------------------------------------------------------------------------------
            // XXX untested
            // vendorise:  function (obj, k, v) {
            //     obj.k = v;
            //     $.each(["moz", "o", "webkit"], function (i, ven) {
            //         obj["-" + ven + "-" + k] = v;
            //     });
            // },
            
            linkCSS:  function (doc, styles) {
    	        if (styles.constructor != Array) styles = [styles];
                $.each(styles, function (i, css) { 
                    $('head', doc).append($("<link/>").attr({
                        rel: 'stylesheet', href: css, type: 'text/css', media: "all", charset: 'utf-8'
                    }));
                });
            },
            
            
            // --- XPATH -------------------------------------------------------------------------------------
            // XXX untested
            //  I'm not sure how portable this is, but it might be workable
            findNodes:    function (xpath, ctx, doc) {
                if (!ctx) ctx = doc;
                var ns = {};
                var snap = doc.evaluate(xpath,
                                        ctx,
                                        function (pfx) { return ns[pfx] || null; }, 
                                        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, 
                                        null);
                var res = [];
                for (var i = 0; i < snap.snapshotLength; i++) res.push(snap.snapshotItem(i));
                return res;
            },
            
            
            // --- PROXY LOADING ------------------------------------------------------------------------------
            // XXX untested
            proxyCount: 0,
            proxyLoad:  function (src, cb) {
                if (document.location.href.indexOf("file:") == 0) {
                    var proxyID = "prox-" + this.proxyCount;
                    this.proxyCount++;
                    proxyCache[proxyID] = cb;
                    var $ifr = $("<iframe/>").attr({
                                                src:    src.replace(/[^\/]+$/, "local-proxy.html"),
                                                id:     "rs-ifr-" + proxyID
                                             })
                                             .css("display", "none");
                    $ifr.load(function () {
                        try {
                            $ifr[0].contentWindow.postMessage(proxyID + "," + src, "*");
                        }
                        catch (e) {
                            error("Could not load through proxy: " + e);
                        }
                    });
                    $ifr.appendTo($("body", document));
                }
                else {
                    $.get(src, cb);
                }
            },
            // XXX untested
            proxyLoadMany:  function (srcs, cb) {
                if (srcs.length == 0) cb([]);
                var loaded = 0;
                var things = [];
                var self = this;
                $.each(srcs, function (i, it) {
                    self.proxyLoad(it, function (data) {
                        loaded++;
                        things.push(data);
                        if (loaded == srcs.length) cb(things);
                    });
                });
            },
            
            // --- RESPEC UI ------------------------------------------------------------------------------
            // XXX untested
            $saveMenu:  null,
            showSaveOptions:    function () {
                var self = this;
                this.$saveMenu = $("<div/>")
                    .css({
                          position: "fixed", width: "400px", top: "10px", padding: "1em", 
                          border: "5px solid #90b8de", background: "#fff"
                          })
                    .appendTo($("body"))
                    .append("<h4>ReSpec Actions Console</h4>")
                    .end();
                
                for (var i = 0; i < this.saveActions.length; i++) {
                    this.$saveMenu.append(this.saveActions[i]);
                }
            },

            // XXX untested
            // Register an action within save menu
            saveActions: [],
            registerSaveAction:     function(label, cb) {
                var self = this;
                this.saveActions.push($("<button>" + label + "</button>")
                .click(function () {self.hideSaveOptions; cb()}));
            },
            
            // XXX untested
            hideSaveOptions:    function () {
                if (!this.$saveMenu) return;
                this.$saveMenu.remove();
            },
            
            // --- HTML SERIALISATION ------------------------------------------------------------------------------
            // XXX untested
            toHTMLSource:    function () {
                var doc = window.open().document;
                doc.write("<pre>" + this.esc(this.stringifyHTML()) + "</pre>");
                doc.close();
                // for some reason no variant on this seems to work, too tired to investigate
                // $("body", doc).append("<pre/>")
                //               .find("pre")
                //                 .text(this.stringifyHTML());
                // doc.close();
            },
            
            // XXX untested
            stringifyHTML:  function () {
                var str = "<!DOCTYPE html";
                var dt = document.doctype;
                if (dt && dt.publicId) {
                    str += " PUBLIC '" + dt.publicId + "' '" + dt.systemId + "'";
                }
                else { // when HTML5 is allowed we can remove this
                    str += " PUBLIC '-//W3C//DTD HTML 4.01 Transitional//EN' 'http://www.w3.org/TR/html4/loose.dtd'";
                }
                str += ">\n";
                str += "<html";
                var ats = document.documentElement.attributes;
                for (var i = 0; i < ats.length; i++) {
                    var an = ats[i].name;
                    //if (an == "xmlns" || an == "xml:lang") continue;
                    str += " " + an + "=\"" + this.esc(ats[i].value) + "\"";
                }
                str += ">\n";
                str += document.documentElement.innerHTML;
                str += "</html>";
                return str;
            },
            
            // --- BASIC ARRAY ------------------------------------------------------------------------------
            // XXX untested
            unique:     function (arr) {
                var ret = [];
                var l = arr.length;
                for (var i = 0; i < l; i++) {
                    for (var j = i+1; j < l; j++) {
                        // If arr[i] is found later in the array
                        if (arr[i] === arr[j]) j = ++i;
                    }
                    ret.push(arr[i]);
                }
                return ret;
            },
            
            // --- BASIC STRING ------------------------------------------------------------------------------
            esc:    function (s) {
                return s.replace(/&/g,'&amp;')
                        .replace(/>/g,'&gt;')
                        .replace(/"/g,'&quot;')
                        .replace(/</g,'&lt;');
            },
            
            norm: function (str) {
                str = str.replace(/^\s+/, "").replace(/\s+$/, "");
                return str.split(/\s+/).join(" ");
            },
            
            // --- TRANSFORMATIONS ------------------------------------------------------------------------------
            // Run list of transforms over content and return result.
            runTransforms: function (content, flist) {
                if (flist) {
                    var methods = flist.split(/\s+/) ;
                    for (var j = 0; j < methods.length; j++) {
                        var call = 'content = ' + methods[j] + '(this,content)' ;
                        try {
                            eval(call) ;
                        } catch (e) {
                            warning('call to ' + call + ' failed with ' + e) ;
                        }
                    }
                }
                return content;
            },
            ieDummy: 1
        };
            
        // Register default save option
        utils.registerSaveAction("Save as HTML Source", function () {
            utils.hideSaveOptions(); utils.toHTMLSource();
        });
        
        return utils;
    }
);
