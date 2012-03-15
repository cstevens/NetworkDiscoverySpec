// XXX untested
define(
    ["core/tt", "core/utils", "text!core/templates/webidl.html"],
    function (tt, utils, template) {
        return {
            run:    function (conf, doc, cb) {
                progress("processing WebIDL");

                // --- RUN THE TEMPLATES
                progress("loading TT for webIDL");
                tt.loadFromHTML(template, doc);
                var infNames = [];

                $(".idl", doc).each(function (i, idl) {
                    var w = new WebIDLProcessor({
                        noIDLSorting:   conf.noIDLSorting,
                        noIDLIn:        conf.noIDLIn,
                        tt:             tt,
                        infNames:       infNames,
                        doc:            doc
                    });

                    var inf = w.definition($(idl));
                    var $pre = $("<pre class='idl'/>");

                    $pre.append(w.writeAsWebIDL(inf));
                    $(idl).replaceWith($pre);
                    
                    var sections = w.writeAsHTML(inf);
                    for (var i = sections.length - 1; i >= 0; i--) {
                        $pre.after(sections[i]);
                    }
                });

                doc.normalize();
                $("a:not([href])", doc).each(function (i, ant) {
                    var $ant = $(ant);
                    if ($ant.hasClass("externalDFN")) return;
                    var name = $ant.text();
                    if ($.inArray(name, infNames) >= 0) {
                        $ant.attr("href", "#idl-def-" + name)
                            .addClass("idlType")
                            .html($("<code/>").text(name));
                    }
                });

                cb();
            },
            ieDummy: 1
        };
    }
);

function WebIDLProcessor (cfg) {
    this.parent = { type: "module", name: "outermost", refId: "outermost", members: [] };
    if (!cfg) cfg = {};
    for (var k in cfg) this[k] = cfg[k];
};

WebIDLProcessor.prototype = {
    definition:    function ($idl) {
        var str = $idl.attr("title");
        var matched = /(typedef|implements)/.exec(str);
        str += matched ? ";" : "{};";
        progress("idl definition: " + str);
        try {
            var def = window.WebIDLParser.parse(str, "definition");
            if (!def.members) def.members = [];
            def.refId = this._id(def.name || def.target);
            def.parentId = this.parent.refId;
            if (def.refId == undefined) warn("definition has no refId");
            if ($.inArray(def.refId, this.infNames) >= 0) warn('duplicate definition of WebIDL ID: ' + def.refId);
            this.infNames.push(def.refId);
            this.parent.members.push(def); // this should be done at the caller level
            this.processMembers(def, $idl);
            
            // Extract a description, unless it's a <dl>
            if (!$idl.is("dl")) def.description = $idl.html();
            return def;
        } catch (e) {
            warn("ERROR: " + e);
            return {};
        }
    },
    
    processMembers:    function (obj, $el) {
        var exParent = this.parent;
        this.parent = obj;
        var wip = this;
        $el.children("dt").each(function (i, dt) {
            var $dd = $(dt).next("dd"); // we take a simple road
            var str = $(dt).text();
            progress("idl member of " + obj.type + ": " + str);
            var mem;
            switch (obj.type) {
            case "module":
                wip.moduleMember($(dt), $dd);
                return;
            case "interface":
                mem = wip.interfaceMember($(dt), $dd);
                break;
            case "exception":
                mem = wip.exceptionMember($(dt), $dd);
                break;
            default:
                error("Unexpected " + obj.type + ": " + str);
                break;
            }
            if (!mem.refId) mem.refId = wip._id(mem.name);
            if (!mem.refId) warn("member has no refId");
            if ($.inArray(mem.refId, this.infNames) >= 0) warn('duplicate definition of WebIDL ID: ' + mem.refId);
            mem.parentId = obj.refId;
            wip.infNames.push(mem.refId);
            if (!mem.description)  mem.description = $dd.html();
            wip.parent.members.push(mem);
        });
        this.parent = exParent;
    },
    
    moduleMember:    function ($dt, $dd) {
        var wip = this;
        $dd.children("[title]").each(function (i, el){
            wip.definition($(el));
        });
        this.parent.description = $dt.text();
    },
    
    exceptionMember:    function ($dt, $dd) {
        var str = $dt.text() + ";";
        var mem = window.WebIDLParser.parse(str, "exMember");
        if (!mem.members) mem.members = [];
        
        return mem;
    },
    
    interfaceMember:    function ($dt, $dd) {
        var str = $dt.text() + ";";
        var mem = window.WebIDLParser.parse(str, "ifMember");
        if (!mem.members) mem.members = [];

        var $extPrm = $dd.find("dl.parameters:first").remove();
        var $excepts = $dd.find(".exception").remove();
        var $sgrs = $dd.find(".getraises, .setraises").remove();

        switch (mem.type) {
        case "const":
            break;
        case "stringifier":
            break;
        case "attribute":
            if (!mem.setraises) mem.setraises = [];
            if (!mem.getraises) mem.getraises = [];
            if (!mem.raises) mem.raises = [];
            $sgrs.each(function (i, el) {
                var $el = $(el);
                var exc = {
                    name:     $el.attr("title")
                };
                
                // Descriptions go into mem.raises array
                if (el.localName.toLowerCase() == "dl") {
                    exc.type = "codelist";
                    exc.description = [];
                    $el.children("dt").each(function (i, dt) {
                        var $dd = $(dt).next("dd");
                        var c = { name: $(dt).text() };
                        c.description = $dd.html();
                        exc.description.push(c);
                    });
                }
                else if (el.localName.toLowerCase() == "div") {
                    exc.type = "simple";
                    exc.description = $el.html();
                }
                else {
                    error("Do not know what to do with exceptions being raised defined outside of a div or dl.");
                }
                $el.remove();
                exc.onSet = $el.hasClass("setraises");
                exc.onGet = $el.hasClass("getraises");
                if (exc.onSet) mem.setraises.push(exc);
                if (exc.onGet) mem.setraises.push(exc);
                mem.raises.push(exc);
            });
            break;
        case "operation":
            // Exceptions
            if (!mem.raises) mem.raises = [];
            $excepts.each(function (i, el) {
                var $el = $(el);
                var exc = { name: $el.attr("title") };
                if (el.localName.toLowerCase() == "dl") {
                    exc.type = "codelist";
                    exc.description = [];
                    $el.children("dt").each(function (i, dt) {
                        var $dd = $(dt).next("dd");
                        var c = { name: $(dt).text() };
                        c.description = $dd.html();
                        exc.description.push(c);
                    });
                }
                else if (el.localName.toLowerCase() == "div") {
                    exc.type = "simple";
                    exc.description = $el.html();
                }
                else {
                    error("Do not know what to do with exceptions being raised defined outside of a div or dl.");
                }
                $el.remove();
                mem.raises.push(exc);
            });
            
            // Parameters
            if (!mem.arguments) mem.arguments = [];
            for (var i = 0; i < mem.arguments.length; i++) {
                if (mem.arguments[i].description == null) mem.arguments[i].description = "";
            }

            $extPrm.children("dt").each(function (i, dt) {
                var $dt = $(dt);
                var $dd = $dt.next("dd"); // we take a simple road
                var prm = $dt.text();
                p = window.WebIDLParser.parse(prm, "Argument");
                p.description = $dd.html();
                mem.arguments.push(p);
            });
            $extPrm.remove();
            break;
        default:
            // NOTHING MATCHED
            error("Expected interface member, got: " + str);
            break;
        }
        return mem;
    },
    
    writeAsHTML: function (obj) {
        var results = [];   // Array of elements
        switch (obj.type) {
        case "exception":
        case "interface":
            var types = ["const", "operation", "attribute", "field"];
            
            // Display sections in a specific order, and potentially sort the contents
            for (var i = 0; i < types.length; i++) {
                var type = types[i];
                var things = obj.members.filter(function (it) { return it.type == type; });
                if (things.length == 0) continue;
                
                var secTitle;
                switch (type) {
                case 'attribute': secTitle = 'Attributes'; break;
                case 'operation': secTitle = 'Methods'; break;
                case 'const': secTitle = 'Constants'; break;
                case 'field': secTitle = 'Fields'; break;
                }
                var $dl = $("<dl/>");
                if (!this.noIDLSorting) {
                    things.sort(function (a, b) {
                        if (a.name < b.name) return -1;
                        if (a.name > b.name) return 1;
                        return 0;
                    });
                }
                
                for (var j = 0; j < things.length; j++) {
                    // Normalize types
                    var el = things[j];
                    if (el.idlType) el.htmlType = this.writeHtmlType(el.idlType);
                    
                    if (el.arguments) {
                        for (var a = 0; a < el.arguments.length; a++) {
                            var arg = el.arguments[a];
                            if (arg.type) arg.htmlType = this.writeHtmlType(arg.type);
                        }
                    }
                    var src = this.tt.exec("webidl-" + type, things[j]);
                    $dl.append($(src));
                }
                var $section = $("<section/>")
                    .append($("<h2/>").text(secTitle))
                    .append($dl);
                results.push($section);
            }
            break;

        case "implements":
            obj.htmlType = this.writeHtmlType(obj['implements']);
            var src = this.tt.exec("webidl-implements", obj);
            results.push($(src));
            break;

        case "module":
            var $df = $(this.doc.createDocumentFragment());
            
            if (obj.description) results.push($("<div>" + obj.description + "</div>"));

            for (idx = 0; idx < obj.members.length; idx++) {
                var it = obj.members[idx];
                var $sec = $("<section/>")
                    .append($("<h2/>").text(it.type + ' ' + (it.name || it.target)));
                var idlHtml = this.writeAsHTML(it);
                for (var i = 0; i < idlHtml.length; i++) {
                    $sec.append(idlHtml[i]);
                }
                results.push($sec);
            }
            break;

        case "typedef":
            obj.htmlType = this.writeHtmlType(obj.idlType);
            var src = this.tt.exec("webidl-typedef", obj);
            results.push($(src));
            break;

        default:
            warn("Unexpected type " + obj.type + ": " + obj.refId);
            break;
        }

        return results;
    },
    
    writeHtmlType:   function (idlType) {
        if (typeof(idlType) == "string") {
            return idlType;
        } else if (idlType.sequence) {
            return "sequence&lt;" + idlType.idlType.idlType + "&gt;";
        } else {
            return idlType.idlType;
        }
    },
    
    writeAsWebIDL: function (obj, indent) {
        if (!indent) indent = 0;
        
        switch (obj.type) {
        case "exception":
            var $span = $("<span class='idlInterface'/>").attr("id", 'idl-def-' + obj.refId)
                .append(this.writeExtAttrs(obj.extAttrs, indent))
                .append(this._idn(indent) + "exception ")
                .append($("<span class='idlExceptionID'/>").text(obj.name))
                .append(" {\n");

            // we process attributes and methods in place
            var maxAttr = 0, maxOp = 0, maxConst = 0;
            for (var idx = 0; idx < obj.members.length; idx++) {
                var it = obj.members[idx];
                var len = this.idlTypeLength(it.idlType);
                if (it.type == "field") maxAttr = (len > maxAttr) ? len : maxAttr;
                else if (it.type == "const") maxConst = (len > maxConst) ? len : maxConst;
                else error("Unknown exception member" + it.type + ": " + it.name + inspect(it));
            }
            var curLnk = "widl-" + obj.refId + "-";
            for (var i = 0; i < obj.members.length; i++) {
                var ch = obj.members[i];
                if (ch.type == "field") $span.append(this.writeField(ch, maxAttr + 1, indent + 1, curLnk));
                else if (ch.type == "const") $span.append(this.writeConst(ch, maxConst + 1, indent + 1, curLnk));
            }
            $span.append(this._idn(indent) + "};\n");
            return $span;

        case "implements":
            return $("<span class='idlImplements'/>")
                .attr("id", "idl-def-" + obj.refId)
                .append(this._idn(indent))
                .append($("<a/>").text(obj.target))
                .append(" implements ")
                .append($("<a class='idlType'/>").append($("<code/>").append(this.writeDatatype(obj['implements']))))
                .append(";\n");

        case "interface":
            var $span = $("<span class='idlInterface'/>").attr("id", 'idl-def-' + obj.refId)
                .append(this.writeExtAttrs(obj.extAttrs, indent))
                .append(this._idn(indent) + "interface ")
                .append($("<span class='idlInterfaceID'/>").text(obj.name));

            if (obj.inheritance && obj.inheritance.length) {
                var classes = 
                    obj.inheritance.map(function (it) {
                         return "<span class='idlSuperclass'><a>" + it + "</a></span>";
                     });
                $span.append(" : " + classes.join(", "));
            }
            $span.append(" {\n");

            // we process attributes and methods in place
            var maxAttr = 0, maxOp = 0, maxConst = 0, hasRO = false;
            for (var idx = 0; idx < obj.members.length; idx++) {
                var it = obj.members[idx];
                var len = this.idlTypeLength(it.idlType);
                if (it.type == "attribute") maxAttr = (len > maxAttr) ? len : maxAttr;
                else if (it.type == "operation") maxOp = (len > maxOp) ? len : maxOp;
                else if (it.type == "const") maxConst = (len > maxConst) ? len : maxConst;
                else error("Unknown interface member" + it.type + ": " + it.name + inspect(it));
                if (it.type == "attribute" && it.readonly) hasRO = true;
            }
            var curLnk = "widl-" + obj.refId + "-";
            for (var i = 0; i < obj.members.length; i++) {
                var ch = obj.members[i];
                if (ch.type == "attribute") $span.append(this.writeAttribute(ch, maxAttr + 1, indent + 1, curLnk, hasRO));
                else if (ch.type == "operation") $span.append(this.writeMethod(ch, maxOp + 1, indent + 1, curLnk));
                else if (ch.type == "const") $span.append(this.writeConst(ch, maxConst + 1, indent + 1, curLnk));
            }
            $span.append(this._idn(indent) + "};\n");
            return $span;

        case "module":
            var $span = $("<span class='idlModule'/>")
                .attr("id", "idl-def-" + obj.refId)
                .append(this.writeExtAttrs(obj.extAttrs, indent))
                .append(this._idn(indent) + "module ")
                .append($("<span class='idModuleId'/>").text(obj.name))
                .append(" {\n");
            for (var idx = 0; idx < obj.members.length; idx++) {
                var it = obj.members[idx];
                $span.append(this.writeAsWebIDL(it, indent + 1));
            }
            $span.append(this._idn(indent) + "};\n");
            return $span;

        case "typedef":
            return $("<span class='idlTypedef'/>")
                .attr("id", "idl-def-" + obj.refId)
                .append(this._idn(indent) + "typedef")
                .append(" ")
                .append($("<span class='idlTypedefType'/>").append(this.writeDatatype(obj.idlType)))
                .append(" ")
                .append($("<span class='idlTypedefID'/>").text(obj.name))
                .append(";\n");

        default:
            $("<p>").text("IDL for " + obj.type + ": " + obj.name).after(inspect(obj, 3));
        }  
    },

    writeField:    function (attr, max, indent, curLnk) {
        var $span = $("<span class='idlField'>");
        $span.append(this.writeExtAttrs(attr.extAttrs, indent))
            .append(this._idn(indent));

        var pad = max - this.idlTypeLength(attr.idlType);
        var padStr = "";
        for (var i = 0; i < pad; i++) padStr += " ";

        $span.append($("<span class='idlFieldType'/>").append(this.writeDatatype(attr.idlType)))
            .append(padStr)
            .append($("<span class='idlFieldName'/>")
                .append($("<a/>")
                    .attr("href", "#" + curLnk + attr.refId)
                    .text(attr.name)))
            .append(";\n");
        return $span;
    },

    writeAttribute:    function (attr, max, indent, curLnk, hasRO) {
        var pad = max - this.idlTypeLength(attr.idlType);
        var padStr = "";
        for (var i = 0; i < pad; i++) padStr += " ";
        var $idlAttrType = this.writeDatatype(attr.idlType);

        var $span = $("<span class='idlAttribute'>")
            .append(this.writeExtAttrs(attr.extAttrs, indent))
            .append(this._idn(indent));

        if (hasRO) {
            if (attr.readonly) $span.append("readonly ");
            else               $span.append("         ");
        }
        $span.append("attribute ")
            .append($("<span class='idlAttrType'/>").append($idlAttrType))
            .append(padStr)
            .append($("<span class='idlAttrName'/>")
                .append($("<a/>")
                    .attr("href", "#" + curLnk + attr.refId)
                    .text(attr.name)));

        if (attr.getraises.length) {
            raises = " getraises ("
                + attr.getraises.map(function (it) {
                    return "<span class='idlRaises'><a>" + it.name + "</a></span>";
                  }).join(", ")
                + ")";
            $span.append(raises);
        }
        
        if (attr.setraises.length) {
            raises = " setraises ("
                + attr.setraises.map(function (it) {
                    return "<span class='idlRaises'><a>" + it.name + "</a></span>";
                  }).join(", ")
                + ")";
            $span.append(raises);
        }
        
        $span.append(";\n");
        return $span;
    },
    
    writeMethod:    function (meth, max, indent, curLnk) {
        var pad = max - this.idlTypeLength(meth.idlType);
        var padStr = "";
        for (var i = 0; i < pad; i++) padStr += " ";

        var $span = $("<span class='idlMethod'>")
            .append(this.writeExtAttrs(meth.extAttrs, indent))
            .append(this._idn(indent))
            .append($("<span class='idlMethType'/>").append(this.writeDatatype(meth.idlType)))
            .append(padStr)
            .append($("<span class='idlMethName'/>")
                .append(
                    $("<a/>")
                        .attr("href", "#" + curLnk + meth.refId)
                        .text(meth.name)))
            .append(" (");
        var self = this;
        for (var i = 0; i < meth.arguments.length; i++) {
            var it = meth.arguments[i];
            var optional = it.optional ? "optional " : "";
            var inp = this.noIDLIn ? "" : " in ";
            var $prm = $("<span class='idlParam'>")
                .append(this.writeExtAttrs(it.extAttrs, null))
                .append(inp + optional);
            var $ptype = $("<span class='idlParamType'/>").append(this.writeDatatype(it.type));
            $prm.append($ptype)
                .append(" ")
                .append($("<span class='idlParamName'/>").text(it.name));
            $span.append($prm);
            if (i < meth.arguments.length - 1) $span.append(", ");
        }
        $span.append(")");
        if (meth.raises.length) {
            raises = " raises ("
                + meth.raises.map(function (it) {
                    return "<span class='idlRaises'><a>" + it.name + "</a></span>";
                  }).join(", ")
                + ")";
            $span.append(raises);
        }
        
        $span.append(";\n");

        return $span;
    },
    
    writeConst:    function (cons, max, indent, curLnk) {
        var pad = max - this.idlTypeLength(cons.idlType);
        var padStr = "";
        for (var i = 0; i < pad; i++) padStr += " ";
        var $idlConstType = this.writeDatatype(cons.idlType);
        var $ctype = $("<span class='idlConstType'/>").append($idlConstType);
        var $cname = $("<span class='idlConstName'/>")
            .append($("<a/>").attr("href", "#" + curLnk + cons.refId).text(cons.name));
        var $span = $("<span class='idlConst'/>")
            .append(this._idn(indent))
            .append("const ")
            .append($ctype)
            .append(padStr)
            .append($cname)
            .append(" = ")
            .append($("<span class='idlConstValue'/>").text(cons.value))
            .append(";\n");
        return $span;
    },

    writeDatatype:    function (idlType) {
        if (idlType.sequence) {
            return $("<span/>").append("sequence&lt;")
                .append(this.writeDatatype(idlType.idlType))
                .append("&gt;");
        }
        else {
            var nullable = idlType.nullable ? "?" : "";
            var arr = idlType.array ? "[]" : "";
            var name = idlType.idlType || idlType;
            return $("<span/>")
                .append($("<a/>").text(name))
                .append("" + arr + nullable);
        }
    },
    
    idlTypeLength:     function (idlType) {
        if (idlType.sequence) {
            return this.idlTypeLength(idlType.idlType) + 10;
        } else if (idlType.idlType) {
            var len = idlType.idlType.length;
            if (idlType.nullable) len = len + 1;
            if (idlType.array) len = len + 2;
            return len;
        } else {
            return idlType.length;
        }
    },
    
    writeExtAttrs:      function(extAttrs, indent) {
        if (!extAttrs) return "";
        var attrs = this._idn(indent) + "[";
        attrs += extAttrs.map(function (a) {
            return "<span class='extAttr'>" + a.name + "</span>";
        }).join(", ");
        attrs += "]";
        if (indent != null) attrs += "\n";
        return attrs;
    },

    _idn:    function (lvl) {
        var str = "";
        for (var i = 0; i < lvl; i++) str += "    ";
        return str;
    },

    // An ID must be an xsd:ID
    _id:    function (id) {
        return id.replace(/[^a-zA-Z0-9_-]/g, "");
    }
};

function inspect(obj, maxLevels, level)
{
  var str = '', type, msg;

    // Start Input Validations
    // Don't touch, we start iterating at level zero
    if(level == null)  level = 0;

    // At least you want to show the first level
    if(maxLevels == null) maxLevels = 1;
    if(maxLevels < 1)     
        return '<font color="red">Error: Levels number must be > 0</font>';

    // We start with a non null object
    if(obj == null)
    return '<font color="red">Error: Object <b>NULL</b></font>';
    // End Input Validations

    // Each Iteration must be indented
    str += '<ul>';

    // Start iterations for all objects in obj
    for(property in obj)
    {
      try
      {
          // Show "property" and "type property"
          type =  typeof(obj[property]);
          str += '<li>(' + type + ') ' + property + 
                 ( (obj[property]==null)?(': <b>null</b>'):('"' + obj[property] +'"')) + '</li>';

          // We keep iterating if this property is an Object, non null
          // and we are inside the required number of levels
          if((type == 'object') && (obj[property] != null) && (level+1 < maxLevels))
          str += inspect(obj[property], maxLevels, level+1);
      }
      catch(err)
      {
        // Is there some properties in obj we can't access? Print it red.
        if(typeof(err) == 'string') msg = err;
        else if(err.message)        msg = err.message;
        else if(err.description)    msg = err.description;
        else                        msg = 'Unknown';

        str += '<li><font color="red">(Error) ' + property + ': ' + msg +'</font></li>';
      }
    }

      // Close indent
      str += '</ul>';

    return str;
}


window.WebIDLParser = (function(){
  /* Generated by PEG.js (http://pegjs.majda.cz/). */
  
  var result = {
    killComments: function (str) {
      return str.replace(/\/\/.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '');
    },

    /*
     * Parses the input with a generated parser. If the parsing is successfull,
     * returns a value explicitly or implicitly specified by the grammar from
     * which the parser was generated (see |PEG.buildParser|). If the parsing is
     * unsuccessful, throws |PEG.grammarParser.SyntaxError| describing the error.
     */
    parse: function(input, start) {
      input = this.killComments(input);
      if (!start) start = 'definitions';
      var funcs = {};

      var pos = 0;
      var rightmostMatchFailuresPos = 0;
      var rightmostMatchFailuresExpected = [];
      var cache = {};
      
      function quoteString(s) {
        /*
         * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
         * string literal except for the closing quote character, backslash,
         * carriage return, line separator, paragraph separator, and line feed.
         * Any character may appear in the form of an escape sequence.
         */
        return '"' + s
          .replace(/\\/g, '\\\\')        // backslash
          .replace(/"/g, '\\"')          // closing quote character
          .replace(/\r/g, '\\r')         // carriage return
          .replace(/\u2028/g, '\\u2028') // line separator
          .replace(/\u2029/g, '\\u2029') // paragraph separator
          .replace(/\n/g, '\\n')         // line feed
          + '"';
      }
      
      function arrayContains(array, value) {
        /*
         * Stupid IE does not have Array.prototype.indexOf, otherwise this
         * function would be a one-liner.
         */
        var length = array.length;
        for (var i = 0; i < length; i++) {
          if (array[i] === value) {
            return true;
          }
        }
        return false;
      }
      
      function matchFailed(failure) {
        if (pos < rightmostMatchFailuresPos) {
          return;
        }
        
        if (pos > rightmostMatchFailuresPos) {
          rightmostMatchFailuresPos = pos;
          rightmostMatchFailuresExpected = [];
        }
        
        if (!arrayContains(rightmostMatchFailuresExpected, failure)) {
          rightmostMatchFailuresExpected.push(failure);
        }
      }
      
      var parse_s = funcs['s'] = function parse_s(context) {
        var cacheKey = "s" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos).match(/^[ 	\r\n]/) !== null) {
          var result1 = input.charAt(pos);
          pos++;
        } else {
          var result1 = null;
          if (context.reportMatchFailures) {
            matchFailed("[ 	\\r\\n]");
          }
        }
        if (result1 !== null) {
          var result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            if (input.substr(pos).match(/^[ 	\r\n]/) !== null) {
              var result1 = input.charAt(pos);
              pos++;
            } else {
              var result1 = null;
              if (context.reportMatchFailures) {
                matchFailed("[ 	\\r\\n]");
              }
            }
          }
        } else {
          var result0 = null;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_w = funcs['w'] = function parse_w(context) {
        var cacheKey = "w" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result1 = parse_s(context);
        var result0 = result1 !== null ? result1 : '';
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_identifier = funcs['identifier'] = function parse_identifier(context) {
        var cacheKey = "identifier" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos).match(/^[A-Z_a-z]/) !== null) {
          var result2 = input.charAt(pos);
          pos++;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed("[A-Z_a-z]");
          }
        }
        if (result2 !== null) {
          var result3 = [];
          if (input.substr(pos).match(/^[0-9A-Z_a-z]/) !== null) {
            var result4 = input.charAt(pos);
            pos++;
          } else {
            var result4 = null;
            if (context.reportMatchFailures) {
              matchFailed("[0-9A-Z_a-z]");
            }
          }
          while (result4 !== null) {
            result3.push(result4);
            if (input.substr(pos).match(/^[0-9A-Z_a-z]/) !== null) {
              var result4 = input.charAt(pos);
              pos++;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed("[0-9A-Z_a-z]");
              }
            }
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(nmstart, nmchars) { return nmstart + nmchars.join(""); })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_octal = funcs['octal'] = function parse_octal(context) {
        var cacheKey = "octal" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "0") {
          var result2 = "0";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("0"));
          }
        }
        if (result2 !== null) {
          var result3 = [];
          if (input.substr(pos).match(/^[0-7]/) !== null) {
            var result4 = input.charAt(pos);
            pos++;
          } else {
            var result4 = null;
            if (context.reportMatchFailures) {
              matchFailed("[0-7]");
            }
          }
          while (result4 !== null) {
            result3.push(result4);
            if (input.substr(pos).match(/^[0-7]/) !== null) {
              var result4 = input.charAt(pos);
              pos++;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed("[0-7]");
              }
            }
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(value) { return "0" + value.join(""); })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_hex = funcs['hex'] = function parse_hex(context) {
        var cacheKey = "hex" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "0") {
          var result2 = "0";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("0"));
          }
        }
        if (result2 !== null) {
          if (input.substr(pos).match(/^[Xx]/) !== null) {
            var result3 = input.charAt(pos);
            pos++;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed("[Xx]");
            }
          }
          if (result3 !== null) {
            if (input.substr(pos).match(/^[0-9A-Fa-f]/) !== null) {
              var result5 = input.charAt(pos);
              pos++;
            } else {
              var result5 = null;
              if (context.reportMatchFailures) {
                matchFailed("[0-9A-Fa-f]");
              }
            }
            if (result5 !== null) {
              var result4 = [];
              while (result5 !== null) {
                result4.push(result5);
                if (input.substr(pos).match(/^[0-9A-Fa-f]/) !== null) {
                  var result5 = input.charAt(pos);
                  pos++;
                } else {
                  var result5 = null;
                  if (context.reportMatchFailures) {
                    matchFailed("[0-9A-Fa-f]");
                  }
                }
              }
            } else {
              var result4 = null;
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(x, value) { return "0" + x + value.join(""); })(result1[1], result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_decimal = funcs['decimal'] = function parse_decimal(context) {
        var cacheKey = "decimal" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos).match(/^[0-9]/) !== null) {
          var result2 = input.charAt(pos);
          pos++;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed("[0-9]");
          }
        }
        if (result2 !== null) {
          var result3 = [];
          if (input.substr(pos).match(/^[0-9]/) !== null) {
            var result4 = input.charAt(pos);
            pos++;
          } else {
            var result4 = null;
            if (context.reportMatchFailures) {
              matchFailed("[0-9]");
            }
          }
          while (result4 !== null) {
            result3.push(result4);
            if (input.substr(pos).match(/^[0-9]/) !== null) {
              var result4 = input.charAt(pos);
              pos++;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed("[0-9]");
              }
            }
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(numStart, numRest) { return numStart + numRest.join(""); })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_integer = funcs['integer'] = function parse_integer(context) {
        var cacheKey = "integer" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "-") {
          var result7 = "-";
          pos += 1;
        } else {
          var result7 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("-"));
          }
        }
        var result2 = result7 !== null ? result7 : '';
        if (result2 !== null) {
          var result6 = parse_hex(context);
          if (result6 !== null) {
            var result3 = result6;
          } else {
            var result5 = parse_octal(context);
            if (result5 !== null) {
              var result3 = result5;
            } else {
              var result4 = parse_decimal(context);
              if (result4 !== null) {
                var result3 = result4;
              } else {
                var result3 = null;;
              };
            };
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(neg, num) { return neg + num; })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_floatEe = funcs['floatEe'] = function parse_floatEe(context) {
        var cacheKey = "floatEe" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos).match(/^[Ee]/) !== null) {
          var result2 = input.charAt(pos);
          pos++;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed("[Ee]");
          }
        }
        if (result2 !== null) {
          if (input.substr(pos).match(/^[+\-]/) !== null) {
            var result6 = input.charAt(pos);
            pos++;
          } else {
            var result6 = null;
            if (context.reportMatchFailures) {
              matchFailed("[+\\-]");
            }
          }
          var result3 = result6 !== null ? result6 : '';
          if (result3 !== null) {
            if (input.substr(pos).match(/^[0-9]/) !== null) {
              var result5 = input.charAt(pos);
              pos++;
            } else {
              var result5 = null;
              if (context.reportMatchFailures) {
                matchFailed("[0-9]");
              }
            }
            if (result5 !== null) {
              var result4 = [];
              while (result5 !== null) {
                result4.push(result5);
                if (input.substr(pos).match(/^[0-9]/) !== null) {
                  var result5 = input.charAt(pos);
                  pos++;
                } else {
                  var result5 = null;
                  if (context.reportMatchFailures) {
                    matchFailed("[0-9]");
                  }
                }
              }
            } else {
              var result4 = null;
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(e, sign, exp) { return e + sign + exp.join(""); })(result1[0], result1[1], result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_expFloat = funcs['expFloat'] = function parse_expFloat(context) {
        var cacheKey = "expFloat" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos).match(/^[0-9]/) !== null) {
          var result4 = input.charAt(pos);
          pos++;
        } else {
          var result4 = null;
          if (context.reportMatchFailures) {
            matchFailed("[0-9]");
          }
        }
        if (result4 !== null) {
          var result2 = [];
          while (result4 !== null) {
            result2.push(result4);
            if (input.substr(pos).match(/^[0-9]/) !== null) {
              var result4 = input.charAt(pos);
              pos++;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed("[0-9]");
              }
            }
          }
        } else {
          var result2 = null;
        }
        if (result2 !== null) {
          var result3 = parse_floatEe(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(num, fee) { return num.join("") + fee; })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_leadFloat = funcs['leadFloat'] = function parse_leadFloat(context) {
        var cacheKey = "leadFloat" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos).match(/^[0-9]/) !== null) {
          var result8 = input.charAt(pos);
          pos++;
        } else {
          var result8 = null;
          if (context.reportMatchFailures) {
            matchFailed("[0-9]");
          }
        }
        if (result8 !== null) {
          var result2 = [];
          while (result8 !== null) {
            result2.push(result8);
            if (input.substr(pos).match(/^[0-9]/) !== null) {
              var result8 = input.charAt(pos);
              pos++;
            } else {
              var result8 = null;
              if (context.reportMatchFailures) {
                matchFailed("[0-9]");
              }
            }
          }
        } else {
          var result2 = null;
        }
        if (result2 !== null) {
          if (input.substr(pos, 1) === ".") {
            var result3 = ".";
            pos += 1;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("."));
            }
          }
          if (result3 !== null) {
            var result4 = [];
            if (input.substr(pos).match(/^[0-9]/) !== null) {
              var result7 = input.charAt(pos);
              pos++;
            } else {
              var result7 = null;
              if (context.reportMatchFailures) {
                matchFailed("[0-9]");
              }
            }
            while (result7 !== null) {
              result4.push(result7);
              if (input.substr(pos).match(/^[0-9]/) !== null) {
                var result7 = input.charAt(pos);
                pos++;
              } else {
                var result7 = null;
                if (context.reportMatchFailures) {
                  matchFailed("[0-9]");
                }
              }
            }
            if (result4 !== null) {
              var result6 = parse_floatEe(context);
              var result5 = result6 !== null ? result6 : '';
              if (result5 !== null) {
                var result1 = [result2, result3, result4, result5];
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(num, dec, fee) { return num.join("") + "." + dec.join("") + fee; })(result1[0], result1[2], result1[3])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_dotFloat = funcs['dotFloat'] = function parse_dotFloat(context) {
        var cacheKey = "dotFloat" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = [];
        if (input.substr(pos).match(/^[0-9]/) !== null) {
          var result8 = input.charAt(pos);
          pos++;
        } else {
          var result8 = null;
          if (context.reportMatchFailures) {
            matchFailed("[0-9]");
          }
        }
        while (result8 !== null) {
          result2.push(result8);
          if (input.substr(pos).match(/^[0-9]/) !== null) {
            var result8 = input.charAt(pos);
            pos++;
          } else {
            var result8 = null;
            if (context.reportMatchFailures) {
              matchFailed("[0-9]");
            }
          }
        }
        if (result2 !== null) {
          if (input.substr(pos, 1) === ".") {
            var result3 = ".";
            pos += 1;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("."));
            }
          }
          if (result3 !== null) {
            if (input.substr(pos).match(/^[0-9]/) !== null) {
              var result7 = input.charAt(pos);
              pos++;
            } else {
              var result7 = null;
              if (context.reportMatchFailures) {
                matchFailed("[0-9]");
              }
            }
            if (result7 !== null) {
              var result4 = [];
              while (result7 !== null) {
                result4.push(result7);
                if (input.substr(pos).match(/^[0-9]/) !== null) {
                  var result7 = input.charAt(pos);
                  pos++;
                } else {
                  var result7 = null;
                  if (context.reportMatchFailures) {
                    matchFailed("[0-9]");
                  }
                }
              }
            } else {
              var result4 = null;
            }
            if (result4 !== null) {
              var result6 = parse_floatEe(context);
              var result5 = result6 !== null ? result6 : '';
              if (result5 !== null) {
                var result1 = [result2, result3, result4, result5];
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(num, dec, fee) { return num.join("") + "." + dec.join("") + fee; })(result1[0], result1[2], result1[3])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_float = funcs['float'] = function parse_float(context) {
        var cacheKey = "float" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "-") {
          var result7 = "-";
          pos += 1;
        } else {
          var result7 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("-"));
          }
        }
        var result2 = result7 !== null ? result7 : '';
        if (result2 !== null) {
          var result6 = parse_leadFloat(context);
          if (result6 !== null) {
            var result3 = result6;
          } else {
            var result5 = parse_dotFloat(context);
            if (result5 !== null) {
              var result3 = result5;
            } else {
              var result4 = parse_expFloat(context);
              if (result4 !== null) {
                var result3 = result4;
              } else {
                var result3 = null;;
              };
            };
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(neg, num) { return neg + num; })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_string = funcs['string'] = function parse_string(context) {
        var cacheKey = "string" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "\"") {
          var result2 = "\"";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("\""));
          }
        }
        if (result2 !== null) {
          var result3 = [];
          if (input.substr(pos).match(/^[^""]/) !== null) {
            var result5 = input.charAt(pos);
            pos++;
          } else {
            var result5 = null;
            if (context.reportMatchFailures) {
              matchFailed("[^\"\"]");
            }
          }
          while (result5 !== null) {
            result3.push(result5);
            if (input.substr(pos).match(/^[^""]/) !== null) {
              var result5 = input.charAt(pos);
              pos++;
            } else {
              var result5 = null;
              if (context.reportMatchFailures) {
                matchFailed("[^\"\"]");
              }
            }
          }
          if (result3 !== null) {
            if (input.substr(pos, 1) === "\"") {
              var result4 = "\"";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("\""));
              }
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(str) { return str.join(""); })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_other = funcs['other'] = function parse_other(context) {
        var cacheKey = "other" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos).match(/^[^	\n\r 0-9A-Z_a-z]/) !== null) {
          var result2 = input.charAt(pos);
          pos++;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed("[^	\\n\\r 0-9A-Z_a-z]");
          }
        }
        if (result2 !== null) {
          var result1 = [];
          while (result2 !== null) {
            result1.push(result2);
            if (input.substr(pos).match(/^[^	\n\r 0-9A-Z_a-z]/) !== null) {
              var result2 = input.charAt(pos);
              pos++;
            } else {
              var result2 = null;
              if (context.reportMatchFailures) {
                matchFailed("[^	\\n\\r 0-9A-Z_a-z]");
              }
            }
          }
        } else {
          var result1 = null;
        }
        var result0 = result1 !== null
          ? (function(other) { return other.join(""); })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_type = funcs['type'] = function parse_type(context) {
        var cacheKey = "type" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_TypeDesc(context);
        if (result2 !== null) {
          var result3 = parse_Nullable(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(type, nullable) {
                      if (!type.sequence) type.sequence = false;
                      type.nullable = nullable;
                      return type; })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_TypeDesc = funcs['TypeDesc'] = function parse_TypeDesc(context) {
        var cacheKey = "TypeDesc" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result4 = parse_Sequence(context);
        if (result4 !== null) {
          var result1 = result4;
        } else {
          var result3 = parse_ArrayType(context);
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result2 = parse_SimpleType(context);
            if (result2 !== null) {
              var result1 = result2;
            } else {
              var result1 = null;;
            };
          };
        }
        var result0 = result1 !== null
          ? (function(type) { return type; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_Sequence = funcs['Sequence'] = function parse_Sequence(context) {
        var cacheKey = "Sequence" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 9) === "sequence<") {
          var result2 = "sequence<";
          pos += 9;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("sequence<"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_type(context);
          if (result3 !== null) {
            if (input.substr(pos, 1) === ">") {
              var result4 = ">";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString(">"));
              }
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(type) { return { sequence: true, array: false, idlType: type }; })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ArrayType = funcs['ArrayType'] = function parse_ArrayType(context) {
        var cacheKey = "ArrayType" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_SimpleType(context);
        if (result2 !== null) {
          if (input.substr(pos, 2) === "[]") {
            var result3 = "[]";
            pos += 2;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("[]"));
            }
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(type) {
                      type.array = true;
                      return type;
                  })(result1[0])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_SimpleType = funcs['SimpleType'] = function parse_SimpleType(context) {
        var cacheKey = "SimpleType" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 3) === "any") {
          var result10 = "any";
          pos += 3;
        } else {
          var result10 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("any"));
          }
        }
        if (result10 !== null) {
          var result1 = result10;
        } else {
          if (input.substr(pos, 6) === "object") {
            var result9 = "object";
            pos += 6;
          } else {
            var result9 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("object"));
            }
          }
          if (result9 !== null) {
            var result1 = result9;
          } else {
            if (input.substr(pos, 7) === "boolean") {
              var result8 = "boolean";
              pos += 7;
            } else {
              var result8 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("boolean"));
              }
            }
            if (result8 !== null) {
              var result1 = result8;
            } else {
              if (input.substr(pos, 5) === "octet") {
                var result7 = "octet";
                pos += 5;
              } else {
                var result7 = null;
                if (context.reportMatchFailures) {
                  matchFailed(quoteString("octet"));
                }
              }
              if (result7 !== null) {
                var result1 = result7;
              } else {
                if (input.substr(pos, 5) === "float") {
                  var result6 = "float";
                  pos += 5;
                } else {
                  var result6 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("float"));
                  }
                }
                if (result6 !== null) {
                  var result1 = result6;
                } else {
                  if (input.substr(pos, 6) === "double") {
                    var result5 = "double";
                    pos += 6;
                  } else {
                    var result5 = null;
                    if (context.reportMatchFailures) {
                      matchFailed(quoteString("double"));
                    }
                  }
                  if (result5 !== null) {
                    var result1 = result5;
                  } else {
                    if (input.substr(pos, 9) === "DOMString") {
                      var result4 = "DOMString";
                      pos += 9;
                    } else {
                      var result4 = null;
                      if (context.reportMatchFailures) {
                        matchFailed(quoteString("DOMString"));
                      }
                    }
                    if (result4 !== null) {
                      var result1 = result4;
                    } else {
                      var result3 = parse_UnsignedIntegerType(context);
                      if (result3 !== null) {
                        var result1 = result3;
                      } else {
                        var result2 = parse_ScopedName(context);
                        if (result2 !== null) {
                          var result1 = result2;
                        } else {
                          var result1 = null;;
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        }
        var result0 = result1 !== null
          ? (function(type) { return { sequence: false, array: false, idlType: type }; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_UnsignedIntegerType = funcs['UnsignedIntegerType'] = function parse_UnsignedIntegerType(context) {
        var cacheKey = "UnsignedIntegerType" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 8) === "unsigned") {
          var result11 = "unsigned";
          pos += 8;
        } else {
          var result11 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("unsigned"));
          }
        }
        var result2 = result11 !== null ? result11 : '';
        if (result2 !== null) {
          var result3 = parse_s(context);
          if (result3 !== null) {
            var savedPos1 = pos;
            if (input.substr(pos, 4) === "long") {
              var result8 = "long";
              pos += 4;
            } else {
              var result8 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("long"));
              }
            }
            if (result8 !== null) {
              var result9 = parse_s(context);
              if (result9 !== null) {
                if (input.substr(pos, 4) === "long") {
                  var result10 = "long";
                  pos += 4;
                } else {
                  var result10 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("long"));
                  }
                }
                if (result10 !== null) {
                  var result7 = [result8, result9, result10];
                } else {
                  var result7 = null;
                  pos = savedPos1;
                }
              } else {
                var result7 = null;
                pos = savedPos1;
              }
            } else {
              var result7 = null;
              pos = savedPos1;
            }
            if (result7 !== null) {
              var result4 = result7;
            } else {
              if (input.substr(pos, 4) === "long") {
                var result6 = "long";
                pos += 4;
              } else {
                var result6 = null;
                if (context.reportMatchFailures) {
                  matchFailed(quoteString("long"));
                }
              }
              if (result6 !== null) {
                var result4 = result6;
              } else {
                if (input.substr(pos, 5) === "short") {
                  var result5 = "short";
                  pos += 5;
                } else {
                  var result5 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("short"));
                  }
                }
                if (result5 !== null) {
                  var result4 = result5;
                } else {
                  var result4 = null;;
                };
              };
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(uns, kind) { return (uns ? "unsigned " : "") + (kind.join ? kind.join("") : kind); })(result1[0], result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ScopedNameList = funcs['ScopedNameList'] = function parse_ScopedNameList(context) {
        var cacheKey = "ScopedNameList" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_ScopedName(context);
        if (result2 !== null) {
          var result3 = [];
          var result4 = parse_ScopedNameListRest(context);
          while (result4 !== null) {
            result3.push(result4);
            var result4 = parse_ScopedNameListRest(context);
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(first, others) {   var ret = [first];
                      for (var i = 0, n = others.length; i < n; i++) { ret.push(others[i]); }
                      return ret; })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ScopedNameListRest = funcs['ScopedNameListRest'] = function parse_ScopedNameListRest(context) {
        var cacheKey = "ScopedNameListRest" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_w(context);
        if (result2 !== null) {
          if (input.substr(pos, 1) === ",") {
            var result3 = ",";
            pos += 1;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString(","));
            }
          }
          if (result3 !== null) {
            var result4 = parse_w(context);
            if (result4 !== null) {
              var result5 = parse_ScopedName(context);
              if (result5 !== null) {
                var result1 = [result2, result3, result4, result5];
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(rest) { return rest; })(result1[3])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ScopedName = funcs['ScopedName'] = function parse_ScopedName(context) {
        var cacheKey = "ScopedName" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result3 = parse_AbsoluteScopedName(context);
        if (result3 !== null) {
          var result1 = result3;
        } else {
          var result2 = parse_RelativeScopedName(context);
          if (result2 !== null) {
            var result1 = result2;
          } else {
            var result1 = null;;
          };
        }
        var result0 = result1 !== null
          ? (function(name) { return name; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_AbsoluteScopedName = funcs['AbsoluteScopedName'] = function parse_AbsoluteScopedName(context) {
        var cacheKey = "AbsoluteScopedName" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 2) === "::") {
          var result2 = "::";
          pos += 2;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("::"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_RelativeScopedName(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(rel) { return "::" + rel; })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_RelativeScopedName = funcs['RelativeScopedName'] = function parse_RelativeScopedName(context) {
        var cacheKey = "RelativeScopedName" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_identifier(context);
        if (result2 !== null) {
          var result3 = [];
          var result4 = parse_ScopedNameRest(context);
          while (result4 !== null) {
            result3.push(result4);
            var result4 = parse_ScopedNameRest(context);
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(name, rest) { return name + rest.join(""); })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ScopedNameRest = funcs['ScopedNameRest'] = function parse_ScopedNameRest(context) {
        var cacheKey = "ScopedNameRest" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 2) === "::") {
          var result2 = "::";
          pos += 2;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("::"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_identifier(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(name) { return name.join(""); })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_BooleanLiteral = funcs['BooleanLiteral'] = function parse_BooleanLiteral(context) {
        var cacheKey = "BooleanLiteral" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 4) === "true") {
          var result3 = "true";
          pos += 4;
        } else {
          var result3 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("true"));
          }
        }
        if (result3 !== null) {
          var result1 = result3;
        } else {
          if (input.substr(pos, 5) === "false") {
            var result2 = "false";
            pos += 5;
          } else {
            var result2 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("false"));
            }
          }
          if (result2 !== null) {
            var result1 = result2;
          } else {
            var result1 = null;;
          };
        }
        var result0 = result1 !== null
          ? (function(value) { return value; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_Nullable = funcs['Nullable'] = function parse_Nullable(context) {
        var cacheKey = "Nullable" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 1) === "?") {
          var result2 = "?";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("?"));
          }
        }
        var result1 = result2 !== null ? result2 : '';
        var result0 = result1 !== null
          ? (function(nullable) { return nullable ? true : false; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ReturnType = funcs['ReturnType'] = function parse_ReturnType(context) {
        var cacheKey = "ReturnType" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos, 4) === "void") {
          var result3 = "void";
          pos += 4;
        } else {
          var result3 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("void"));
          }
        }
        if (result3 !== null) {
          var result1 = result3;
        } else {
          var result2 = parse_type(context);
          if (result2 !== null) {
            var result1 = result2;
          } else {
            var result1 = null;;
          };
        }
        var result0 = result1 !== null
          ? (function(ret) { return ret; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_definitions = funcs['definitions'] = function parse_definitions(context) {
        var cacheKey = "definitions" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_w(context);
        if (result2 !== null) {
          var result3 = [];
          var result4 = parse_definition(context);
          while (result4 !== null) {
            result3.push(result4);
            var result4 = parse_definition(context);
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(defs) { return defs; })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_definition = funcs['definition'] = function parse_definition(context) {
        var cacheKey = "definition" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result6 = parse_module(context);
        if (result6 !== null) {
          var result1 = result6;
        } else {
          var result5 = parse_interface(context);
          if (result5 !== null) {
            var result1 = result5;
          } else {
            var result4 = parse_typedef(context);
            if (result4 !== null) {
              var result1 = result4;
            } else {
              var result3 = parse_exception(context);
              if (result3 !== null) {
                var result1 = result3;
              } else {
                var result2 = parse_implements(context);
                if (result2 !== null) {
                  var result1 = result2;
                } else {
                  var result1 = null;;
                };
              };
            };
          };
        }
        var result0 = result1 !== null
          ? (function(def) { return def; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_module = funcs['module'] = function parse_module(context) {
        var cacheKey = "module" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result17 = parse_extendedAttributeList(context);
        var result2 = result17 !== null ? result17 : '';
        if (result2 !== null) {
          var result16 = parse_s(context);
          var result3 = result16 !== null ? result16 : '';
          if (result3 !== null) {
            if (input.substr(pos, 6) === "module") {
              var result4 = "module";
              pos += 6;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("module"));
              }
            }
            if (result4 !== null) {
              var result5 = parse_s(context);
              if (result5 !== null) {
                var result6 = parse_identifier(context);
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    if (input.substr(pos, 1) === "{") {
                      var result8 = "{";
                      pos += 1;
                    } else {
                      var result8 = null;
                      if (context.reportMatchFailures) {
                        matchFailed(quoteString("{"));
                      }
                    }
                    if (result8 !== null) {
                      var result9 = parse_w(context);
                      if (result9 !== null) {
                        var result10 = parse_definitions(context);
                        if (result10 !== null) {
                          var result11 = parse_w(context);
                          if (result11 !== null) {
                            if (input.substr(pos, 1) === "}") {
                              var result12 = "}";
                              pos += 1;
                            } else {
                              var result12 = null;
                              if (context.reportMatchFailures) {
                                matchFailed(quoteString("}"));
                              }
                            }
                            if (result12 !== null) {
                              var result13 = parse_w(context);
                              if (result13 !== null) {
                                if (input.substr(pos, 1) === ";") {
                                  var result14 = ";";
                                  pos += 1;
                                } else {
                                  var result14 = null;
                                  if (context.reportMatchFailures) {
                                    matchFailed(quoteString(";"));
                                  }
                                }
                                if (result14 !== null) {
                                  var result15 = parse_w(context);
                                  if (result15 !== null) {
                                    var result1 = [result2, result3, result4, result5, result6, result7, result8, result9, result10, result11, result12, result13, result14, result15];
                                  } else {
                                    var result1 = null;
                                    pos = savedPos0;
                                  }
                                } else {
                                  var result1 = null;
                                  pos = savedPos0;
                                }
                              } else {
                                var result1 = null;
                                pos = savedPos0;
                              }
                            } else {
                              var result1 = null;
                              pos = savedPos0;
                            }
                          } else {
                            var result1 = null;
                            pos = savedPos0;
                          }
                        } else {
                          var result1 = null;
                          pos = savedPos0;
                        }
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(extAttrs, name, defs) { return { type: "module", name: name, definitions: defs, extAttrs: extAttrs }; })(result1[0], result1[4], result1[8])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_implements = funcs['implements'] = function parse_implements(context) {
        var cacheKey = "implements" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result13 = parse_extendedAttributeList(context);
        var result2 = result13 !== null ? result13 : '';
        if (result2 !== null) {
          var result12 = parse_s(context);
          var result3 = result12 !== null ? result12 : '';
          if (result3 !== null) {
            var result4 = parse_ScopedName(context);
            if (result4 !== null) {
              var result5 = parse_s(context);
              if (result5 !== null) {
                if (input.substr(pos, 10) === "implements") {
                  var result6 = "implements";
                  pos += 10;
                } else {
                  var result6 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("implements"));
                  }
                }
                if (result6 !== null) {
                  var result7 = parse_s(context);
                  if (result7 !== null) {
                    var result8 = parse_ScopedName(context);
                    if (result8 !== null) {
                      var result9 = parse_w(context);
                      if (result9 !== null) {
                        if (input.substr(pos, 1) === ";") {
                          var result10 = ";";
                          pos += 1;
                        } else {
                          var result10 = null;
                          if (context.reportMatchFailures) {
                            matchFailed(quoteString(";"));
                          }
                        }
                        if (result10 !== null) {
                          var result11 = parse_w(context);
                          if (result11 !== null) {
                            var result1 = [result2, result3, result4, result5, result6, result7, result8, result9, result10, result11];
                          } else {
                            var result1 = null;
                            pos = savedPos0;
                          }
                        } else {
                          var result1 = null;
                          pos = savedPos0;
                        }
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(extAttrs, target, impl) { return { type: 'implements', target: target, 'implements': impl, extAttrs: extAttrs }; })(result1[0], result1[2], result1[6])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_interface = funcs['interface'] = function parse_interface(context) {
        var cacheKey = "interface" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result21 = parse_extendedAttributeList(context);
        var result2 = result21 !== null ? result21 : '';
        if (result2 !== null) {
          var result20 = parse_s(context);
          var result3 = result20 !== null ? result20 : '';
          if (result3 !== null) {
            if (input.substr(pos, 9) === "interface") {
              var result4 = "interface";
              pos += 9;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("interface"));
              }
            }
            if (result4 !== null) {
              var result5 = parse_s(context);
              if (result5 !== null) {
                var result6 = parse_identifier(context);
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    var result19 = parse_ifInheritance(context);
                    var result8 = result19 !== null ? result19 : '';
                    if (result8 !== null) {
                      var result9 = parse_w(context);
                      if (result9 !== null) {
                        if (input.substr(pos, 1) === "{") {
                          var result10 = "{";
                          pos += 1;
                        } else {
                          var result10 = null;
                          if (context.reportMatchFailures) {
                            matchFailed(quoteString("{"));
                          }
                        }
                        if (result10 !== null) {
                          var result11 = parse_w(context);
                          if (result11 !== null) {
                            var result12 = [];
                            var result18 = parse_ifMember(context);
                            while (result18 !== null) {
                              result12.push(result18);
                              var result18 = parse_ifMember(context);
                            }
                            if (result12 !== null) {
                              var result13 = parse_w(context);
                              if (result13 !== null) {
                                if (input.substr(pos, 1) === "}") {
                                  var result14 = "}";
                                  pos += 1;
                                } else {
                                  var result14 = null;
                                  if (context.reportMatchFailures) {
                                    matchFailed(quoteString("}"));
                                  }
                                }
                                if (result14 !== null) {
                                  var result15 = parse_w(context);
                                  if (result15 !== null) {
                                    if (input.substr(pos, 1) === ";") {
                                      var result16 = ";";
                                      pos += 1;
                                    } else {
                                      var result16 = null;
                                      if (context.reportMatchFailures) {
                                        matchFailed(quoteString(";"));
                                      }
                                    }
                                    if (result16 !== null) {
                                      var result17 = parse_w(context);
                                      if (result17 !== null) {
                                        var result1 = [result2, result3, result4, result5, result6, result7, result8, result9, result10, result11, result12, result13, result14, result15, result16, result17];
                                      } else {
                                        var result1 = null;
                                        pos = savedPos0;
                                      }
                                    } else {
                                      var result1 = null;
                                      pos = savedPos0;
                                    }
                                  } else {
                                    var result1 = null;
                                    pos = savedPos0;
                                  }
                                } else {
                                  var result1 = null;
                                  pos = savedPos0;
                                }
                              } else {
                                var result1 = null;
                                pos = savedPos0;
                              }
                            } else {
                              var result1 = null;
                              pos = savedPos0;
                            }
                          } else {
                            var result1 = null;
                            pos = savedPos0;
                          }
                        } else {
                          var result1 = null;
                          pos = savedPos0;
                        }
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(extAttrs, name, herit, mem) { return { type: "interface", name: name, inheritance: herit, members: mem, extAttrs: extAttrs }; })(result1[0], result1[4], result1[6], result1[10])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ifInheritance = funcs['ifInheritance'] = function parse_ifInheritance(context) {
        var cacheKey = "ifInheritance" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === ":") {
          var result2 = ":";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString(":"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            var result4 = parse_ScopedNameList(context);
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(herit) { return herit; })(result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ifMember = funcs['ifMember'] = function parse_ifMember(context) {
        var cacheKey = "ifMember" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result3 = parse_const(context);
        if (result3 !== null) {
          var result1 = result3;
        } else {
          var result2 = parse_attrOrOp(context);
          if (result2 !== null) {
            var result1 = result2;
          } else {
            var result1 = null;;
          };
        }
        var result0 = result1 !== null
          ? (function(mem) { return mem; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_const = funcs['const'] = function parse_const(context) {
        var cacheKey = "const" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result17 = parse_extendedAttributeList(context);
        var result2 = result17 !== null ? result17 : '';
        if (result2 !== null) {
          var result16 = parse_s(context);
          var result3 = result16 !== null ? result16 : '';
          if (result3 !== null) {
            if (input.substr(pos, 5) === "const") {
              var result4 = "const";
              pos += 5;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("const"));
              }
            }
            if (result4 !== null) {
              var result5 = parse_s(context);
              if (result5 !== null) {
                var result6 = parse_type(context);
                if (result6 !== null) {
                  var result7 = parse_s(context);
                  if (result7 !== null) {
                    var result8 = parse_identifier(context);
                    if (result8 !== null) {
                      var result9 = parse_w(context);
                      if (result9 !== null) {
                        if (input.substr(pos, 1) === "=") {
                          var result10 = "=";
                          pos += 1;
                        } else {
                          var result10 = null;
                          if (context.reportMatchFailures) {
                            matchFailed(quoteString("="));
                          }
                        }
                        if (result10 !== null) {
                          var result11 = parse_w(context);
                          if (result11 !== null) {
                            var result12 = parse_constExpr(context);
                            if (result12 !== null) {
                              var result13 = parse_w(context);
                              if (result13 !== null) {
                                if (input.substr(pos, 1) === ";") {
                                  var result14 = ";";
                                  pos += 1;
                                } else {
                                  var result14 = null;
                                  if (context.reportMatchFailures) {
                                    matchFailed(quoteString(";"));
                                  }
                                }
                                if (result14 !== null) {
                                  var result15 = parse_w(context);
                                  if (result15 !== null) {
                                    var result1 = [result2, result3, result4, result5, result6, result7, result8, result9, result10, result11, result12, result13, result14, result15];
                                  } else {
                                    var result1 = null;
                                    pos = savedPos0;
                                  }
                                } else {
                                  var result1 = null;
                                  pos = savedPos0;
                                }
                              } else {
                                var result1 = null;
                                pos = savedPos0;
                              }
                            } else {
                              var result1 = null;
                              pos = savedPos0;
                            }
                          } else {
                            var result1 = null;
                            pos = savedPos0;
                          }
                        } else {
                          var result1 = null;
                          pos = savedPos0;
                        }
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(extAttrs, type, name, value) { return { type: "const", extAttrs: extAttrs, idlType: type, name: name, value: value }; })(result1[0], result1[4], result1[6], result1[10])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_constExpr = funcs['constExpr'] = function parse_constExpr(context) {
        var cacheKey = "constExpr" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result4 = parse_BooleanLiteral(context);
        if (result4 !== null) {
          var result1 = result4;
        } else {
          var result3 = parse_float(context);
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result2 = parse_integer(context);
            if (result2 !== null) {
              var result1 = result2;
            } else {
              var result1 = null;;
            };
          };
        }
        var result0 = result1 !== null
          ? (function(value) { return value; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_attrOrOp = funcs['attrOrOp'] = function parse_attrOrOp(context) {
        var cacheKey = "attrOrOp" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result4 = parse_Stringifier(context);
        if (result4 !== null) {
          var result1 = result4;
        } else {
          var result3 = parse_Attribute(context);
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result2 = parse_Operation(context);
            if (result2 !== null) {
              var result1 = result2;
            } else {
              var result1 = null;;
            };
          };
        }
        var result0 = result1 !== null
          ? (function(ao) { return ao; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_Stringifier = funcs['Stringifier'] = function parse_Stringifier(context) {
        var cacheKey = "Stringifier" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 11) === "stringifier") {
          var result2 = "stringifier";
          pos += 11;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("stringifier"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            var result7 = parse_Attribute(context);
            if (result7 !== null) {
              var result4 = result7;
            } else {
              var result6 = parse_OperationRest(context);
              if (result6 !== null) {
                var result4 = result6;
              } else {
                if (input.substr(pos, 1) === ";") {
                  var result5 = ";";
                  pos += 1;
                } else {
                  var result5 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString(";"));
                  }
                }
                if (result5 !== null) {
                  var result4 = result5;
                } else {
                  var result4 = null;;
                };
              };
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(rest) {
                      if (rest === ";") return { type: "stringifier" };
                      else {
                          rest.stringifier = true;
                          return rest;
                      }
                  })(result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_Attribute = funcs['Attribute'] = function parse_Attribute(context) {
        var cacheKey = "Attribute" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result22 = parse_extendedAttributeList(context);
        var result2 = result22 !== null ? result22 : '';
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            var savedPos1 = pos;
            if (input.substr(pos, 8) === "readonly") {
              var result20 = "readonly";
              pos += 8;
            } else {
              var result20 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("readonly"));
              }
            }
            if (result20 !== null) {
              var result21 = parse_s(context);
              if (result21 !== null) {
                var result19 = [result20, result21];
              } else {
                var result19 = null;
                pos = savedPos1;
              }
            } else {
              var result19 = null;
              pos = savedPos1;
            }
            var result4 = result19 !== null ? result19 : '';
            if (result4 !== null) {
              if (input.substr(pos, 9) === "attribute") {
                var result5 = "attribute";
                pos += 9;
              } else {
                var result5 = null;
                if (context.reportMatchFailures) {
                  matchFailed(quoteString("attribute"));
                }
              }
              if (result5 !== null) {
                var result6 = parse_s(context);
                if (result6 !== null) {
                  var result7 = parse_type(context);
                  if (result7 !== null) {
                    var result8 = parse_s(context);
                    if (result8 !== null) {
                      var result9 = parse_identifier(context);
                      if (result9 !== null) {
                        var result10 = parse_w(context);
                        if (result10 !== null) {
                          var result18 = parse_GetRaises(context);
                          var result11 = result18 !== null ? result18 : '';
                          if (result11 !== null) {
                            var result12 = parse_w(context);
                            if (result12 !== null) {
                              var result17 = parse_SetRaises(context);
                              var result13 = result17 !== null ? result17 : '';
                              if (result13 !== null) {
                                var result14 = parse_w(context);
                                if (result14 !== null) {
                                  if (input.substr(pos, 1) === ";") {
                                    var result15 = ";";
                                    pos += 1;
                                  } else {
                                    var result15 = null;
                                    if (context.reportMatchFailures) {
                                      matchFailed(quoteString(";"));
                                    }
                                  }
                                  if (result15 !== null) {
                                    var result16 = parse_w(context);
                                    if (result16 !== null) {
                                      var result1 = [result2, result3, result4, result5, result6, result7, result8, result9, result10, result11, result12, result13, result14, result15, result16];
                                    } else {
                                      var result1 = null;
                                      pos = savedPos0;
                                    }
                                  } else {
                                    var result1 = null;
                                    pos = savedPos0;
                                  }
                                } else {
                                  var result1 = null;
                                  pos = savedPos0;
                                }
                              } else {
                                var result1 = null;
                                pos = savedPos0;
                              }
                            } else {
                              var result1 = null;
                              pos = savedPos0;
                            }
                          } else {
                            var result1 = null;
                            pos = savedPos0;
                          }
                        } else {
                          var result1 = null;
                          pos = savedPos0;
                        }
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(extAttrs, ro, type, name, gr, sr) { return { type: "attribute", extAttrs: extAttrs, idlType: type, name: name, readonly: (ro ? true : false), getraises: gr, setraises: sr }; })(result1[0], result1[2], result1[5], result1[7], result1[9], result1[11])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_GetRaises = funcs['GetRaises'] = function parse_GetRaises(context) {
        var cacheKey = "GetRaises" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 9) === "getraises") {
          var result2 = "getraises";
          pos += 9;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("getraises"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            if (input.substr(pos, 1) === "(") {
              var result4 = "(";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("("));
              }
            }
            if (result4 !== null) {
              var result5 = parse_ScopedNameList(context);
              if (result5 !== null) {
                if (input.substr(pos, 1) === ")") {
                  var result6 = ")";
                  pos += 1;
                } else {
                  var result6 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString(")"));
                  }
                }
                if (result6 !== null) {
                  var result1 = [result2, result3, result4, result5, result6];
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(list) { return list; })(result1[3])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_SetRaises = funcs['SetRaises'] = function parse_SetRaises(context) {
        var cacheKey = "SetRaises" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 9) === "setraises") {
          var result2 = "setraises";
          pos += 9;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("setraises"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            if (input.substr(pos, 1) === "(") {
              var result4 = "(";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("("));
              }
            }
            if (result4 !== null) {
              var result5 = parse_ScopedNameList(context);
              if (result5 !== null) {
                if (input.substr(pos, 1) === ")") {
                  var result6 = ")";
                  pos += 1;
                } else {
                  var result6 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString(")"));
                  }
                }
                if (result6 !== null) {
                  var result1 = [result2, result3, result4, result5, result6];
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(list) { return list; })(result1[3])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_Operation = funcs['Operation'] = function parse_Operation(context) {
        var cacheKey = "Operation" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result7 = parse_extendedAttributeList(context);
        var result2 = result7 !== null ? result7 : '';
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            var result4 = parse_OmittableSpecials(context);
            if (result4 !== null) {
              var result5 = parse_w(context);
              if (result5 !== null) {
                var result6 = parse_OperationRest(context);
                if (result6 !== null) {
                  var result1 = [result2, result3, result4, result5, result6];
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(extAttrs, oms, rest) {
                      for (var k in oms) rest[k] = oms[k];
                      if (extAttrs) rest.extAttrs = extAttrs;
                      return rest;
                  })(result1[0], result1[2], result1[4])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_OmittableSpecials = funcs['OmittableSpecials'] = function parse_OmittableSpecials(context) {
        var cacheKey = "OmittableSpecials" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 9) === "omittable") {
          var result6 = "omittable";
          pos += 9;
        } else {
          var result6 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("omittable"));
          }
        }
        var result2 = result6 !== null ? result6 : '';
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            var result4 = [];
            var result5 = parse_Specials(context);
            while (result5 !== null) {
              result4.push(result5);
              var result5 = parse_Specials(context);
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(om, spe) {
                      var ret = {};
                      for (var i = 0, n = spe.length; i < n; i++) { ret[spe[i]] = true; }
                      ret.omittable = (om ? true : false);
                      return ret;
                  })(result1[0], result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_Specials = funcs['Specials'] = function parse_Specials(context) {
        var cacheKey = "Specials" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_w(context);
        if (result2 !== null) {
          if (input.substr(pos, 6) === "getter") {
            var result9 = "getter";
            pos += 6;
          } else {
            var result9 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("getter"));
            }
          }
          if (result9 !== null) {
            var result3 = result9;
          } else {
            if (input.substr(pos, 6) === "setter") {
              var result8 = "setter";
              pos += 6;
            } else {
              var result8 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("setter"));
              }
            }
            if (result8 !== null) {
              var result3 = result8;
            } else {
              if (input.substr(pos, 7) === "creator") {
                var result7 = "creator";
                pos += 7;
              } else {
                var result7 = null;
                if (context.reportMatchFailures) {
                  matchFailed(quoteString("creator"));
                }
              }
              if (result7 !== null) {
                var result3 = result7;
              } else {
                if (input.substr(pos, 7) === "deleter") {
                  var result6 = "deleter";
                  pos += 7;
                } else {
                  var result6 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("deleter"));
                  }
                }
                if (result6 !== null) {
                  var result3 = result6;
                } else {
                  if (input.substr(pos, 6) === "caller") {
                    var result5 = "caller";
                    pos += 6;
                  } else {
                    var result5 = null;
                    if (context.reportMatchFailures) {
                      matchFailed(quoteString("caller"));
                    }
                  }
                  if (result5 !== null) {
                    var result3 = result5;
                  } else {
                    var result3 = null;;
                  };
                };
              };
            };
          }
          if (result3 !== null) {
            var result4 = parse_w(context);
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(spe) {
                      return spe;
                  })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_OperationRest = funcs['OperationRest'] = function parse_OperationRest(context) {
        var cacheKey = "OperationRest" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_ReturnType(context);
        if (result2 !== null) {
          var result3 = parse_s(context);
          if (result3 !== null) {
            var result18 = parse_identifier(context);
            var result4 = result18 !== null ? result18 : '';
            if (result4 !== null) {
              var result5 = parse_w(context);
              if (result5 !== null) {
                if (input.substr(pos, 1) === "(") {
                  var result6 = "(";
                  pos += 1;
                } else {
                  var result6 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("("));
                  }
                }
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    var result17 = parse_Arguments(context);
                    var result8 = result17 !== null ? result17 : '';
                    if (result8 !== null) {
                      var result9 = parse_w(context);
                      if (result9 !== null) {
                        if (input.substr(pos, 1) === ")") {
                          var result10 = ")";
                          pos += 1;
                        } else {
                          var result10 = null;
                          if (context.reportMatchFailures) {
                            matchFailed(quoteString(")"));
                          }
                        }
                        if (result10 !== null) {
                          var result11 = parse_w(context);
                          if (result11 !== null) {
                            var result16 = parse_Raises(context);
                            var result12 = result16 !== null ? result16 : '';
                            if (result12 !== null) {
                              var result13 = parse_w(context);
                              if (result13 !== null) {
                                if (input.substr(pos, 1) === ";") {
                                  var result14 = ";";
                                  pos += 1;
                                } else {
                                  var result14 = null;
                                  if (context.reportMatchFailures) {
                                    matchFailed(quoteString(";"));
                                  }
                                }
                                if (result14 !== null) {
                                  var result15 = parse_w(context);
                                  if (result15 !== null) {
                                    var result1 = [result2, result3, result4, result5, result6, result7, result8, result9, result10, result11, result12, result13, result14, result15];
                                  } else {
                                    var result1 = null;
                                    pos = savedPos0;
                                  }
                                } else {
                                  var result1 = null;
                                  pos = savedPos0;
                                }
                              } else {
                                var result1 = null;
                                pos = savedPos0;
                              }
                            } else {
                              var result1 = null;
                              pos = savedPos0;
                            }
                          } else {
                            var result1 = null;
                            pos = savedPos0;
                          }
                        } else {
                          var result1 = null;
                          pos = savedPos0;
                        }
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(ret, name, args, exc) { return { type: "operation", idlType: ret, name: name, arguments: (args ? args : []), raises: exc }; })(result1[0], result1[2], result1[6], result1[10])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_Arguments = funcs['Arguments'] = function parse_Arguments(context) {
        var cacheKey = "Arguments" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_Argument(context);
        if (result2 !== null) {
          var result3 = [];
          var result4 = parse_ArgumentsRest(context);
          while (result4 !== null) {
            result3.push(result4);
            var result4 = parse_ArgumentsRest(context);
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(first, others) {   var ret = [first];
                      for (var i = 0, n = others.length; i < n; i++) { ret.push(others[i]); }
                      return ret; })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ArgumentsRest = funcs['ArgumentsRest'] = function parse_ArgumentsRest(context) {
        var cacheKey = "ArgumentsRest" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_w(context);
        if (result2 !== null) {
          if (input.substr(pos, 1) === ",") {
            var result3 = ",";
            pos += 1;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString(","));
            }
          }
          if (result3 !== null) {
            var result4 = parse_w(context);
            if (result4 !== null) {
              var result5 = parse_Argument(context);
              if (result5 !== null) {
                var result1 = [result2, result3, result4, result5];
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(rest) { return rest; })(result1[3])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_Argument = funcs['Argument'] = function parse_Argument(context) {
        var cacheKey = "Argument" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result15 = parse_extendedAttributeList(context);
        var result2 = result15 !== null ? result15 : '';
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            if (input.substr(pos, 2) === "in") {
              var result14 = "in";
              pos += 2;
            } else {
              var result14 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("in"));
              }
            }
            var result4 = result14 !== null ? result14 : '';
            if (result4 !== null) {
              var result5 = parse_w(context);
              if (result5 !== null) {
                if (input.substr(pos, 8) === "optional") {
                  var result13 = "optional";
                  pos += 8;
                } else {
                  var result13 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("optional"));
                  }
                }
                var result6 = result13 !== null ? result13 : '';
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    var result8 = parse_type(context);
                    if (result8 !== null) {
                      if (input.substr(pos, 3) === "...") {
                        var result12 = "...";
                        pos += 3;
                      } else {
                        var result12 = null;
                        if (context.reportMatchFailures) {
                          matchFailed(quoteString("..."));
                        }
                      }
                      var result9 = result12 !== null ? result12 : '';
                      if (result9 !== null) {
                        var result10 = parse_s(context);
                        if (result10 !== null) {
                          var result11 = parse_identifier(context);
                          if (result11 !== null) {
                            var result1 = [result2, result3, result4, result5, result6, result7, result8, result9, result10, result11];
                          } else {
                            var result1 = null;
                            pos = savedPos0;
                          }
                        } else {
                          var result1 = null;
                          pos = savedPos0;
                        }
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(extAttrs, opt, type, ell, name) { return { name: name, type: type, variadic: (ell ? true : false), optional: (opt ? true : false), extAttrs: extAttrs }; })(result1[0], result1[4], result1[6], result1[7], result1[9])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_Raises = funcs['Raises'] = function parse_Raises(context) {
        var cacheKey = "Raises" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 6) === "raises") {
          var result2 = "raises";
          pos += 6;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("raises"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_s(context);
          if (result3 !== null) {
            if (input.substr(pos, 1) === "(") {
              var result4 = "(";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("("));
              }
            }
            if (result4 !== null) {
              var result5 = parse_w(context);
              if (result5 !== null) {
                var result6 = parse_ScopedNameList(context);
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    if (input.substr(pos, 1) === ")") {
                      var result8 = ")";
                      pos += 1;
                    } else {
                      var result8 = null;
                      if (context.reportMatchFailures) {
                        matchFailed(quoteString(")"));
                      }
                    }
                    if (result8 !== null) {
                      var result1 = [result2, result3, result4, result5, result6, result7, result8];
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(list) { return list; })(result1[4])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_typedef = funcs['typedef'] = function parse_typedef(context) {
        var cacheKey = "typedef" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 7) === "typedef") {
          var result2 = "typedef";
          pos += 7;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("typedef"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_s(context);
          if (result3 !== null) {
            var result4 = parse_type(context);
            if (result4 !== null) {
              var result5 = parse_s(context);
              if (result5 !== null) {
                var result6 = parse_identifier(context);
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    if (input.substr(pos, 1) === ";") {
                      var result8 = ";";
                      pos += 1;
                    } else {
                      var result8 = null;
                      if (context.reportMatchFailures) {
                        matchFailed(quoteString(";"));
                      }
                    }
                    if (result8 !== null) {
                      var result9 = parse_w(context);
                      if (result9 !== null) {
                        var result1 = [result2, result3, result4, result5, result6, result7, result8, result9];
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(type, name) { return { type: 'typedef', name: name, idlType: type }; })(result1[2], result1[4])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_exception = funcs['exception'] = function parse_exception(context) {
        var cacheKey = "exception" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result17 = parse_extendedAttributeList(context);
        var result2 = result17 !== null ? result17 : '';
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            if (input.substr(pos, 9) === "exception") {
              var result4 = "exception";
              pos += 9;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("exception"));
              }
            }
            if (result4 !== null) {
              var result5 = parse_s(context);
              if (result5 !== null) {
                var result6 = parse_identifier(context);
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    if (input.substr(pos, 1) === "{") {
                      var result8 = "{";
                      pos += 1;
                    } else {
                      var result8 = null;
                      if (context.reportMatchFailures) {
                        matchFailed(quoteString("{"));
                      }
                    }
                    if (result8 !== null) {
                      var result9 = parse_w(context);
                      if (result9 !== null) {
                        var result10 = [];
                        var result16 = parse_exMember(context);
                        while (result16 !== null) {
                          result10.push(result16);
                          var result16 = parse_exMember(context);
                        }
                        if (result10 !== null) {
                          var result11 = parse_w(context);
                          if (result11 !== null) {
                            if (input.substr(pos, 1) === "}") {
                              var result12 = "}";
                              pos += 1;
                            } else {
                              var result12 = null;
                              if (context.reportMatchFailures) {
                                matchFailed(quoteString("}"));
                              }
                            }
                            if (result12 !== null) {
                              var result13 = parse_w(context);
                              if (result13 !== null) {
                                if (input.substr(pos, 1) === ";") {
                                  var result14 = ";";
                                  pos += 1;
                                } else {
                                  var result14 = null;
                                  if (context.reportMatchFailures) {
                                    matchFailed(quoteString(";"));
                                  }
                                }
                                if (result14 !== null) {
                                  var result15 = parse_w(context);
                                  if (result15 !== null) {
                                    var result1 = [result2, result3, result4, result5, result6, result7, result8, result9, result10, result11, result12, result13, result14, result15];
                                  } else {
                                    var result1 = null;
                                    pos = savedPos0;
                                  }
                                } else {
                                  var result1 = null;
                                  pos = savedPos0;
                                }
                              } else {
                                var result1 = null;
                                pos = savedPos0;
                              }
                            } else {
                              var result1 = null;
                              pos = savedPos0;
                            }
                          } else {
                            var result1 = null;
                            pos = savedPos0;
                          }
                        } else {
                          var result1 = null;
                          pos = savedPos0;
                        }
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(extAttrs, name, mem) { return { type: 'exception', name: name, members: mem, extAttrs: extAttrs }; })(result1[0], result1[4], result1[8])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_exMember = funcs['exMember'] = function parse_exMember(context) {
        var cacheKey = "exMember" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result3 = parse_const(context);
        if (result3 !== null) {
          var result1 = result3;
        } else {
          var result2 = parse_field(context);
          if (result2 !== null) {
            var result1 = result2;
          } else {
            var result1 = null;;
          };
        }
        var result0 = result1 !== null
          ? (function(mem) { return mem; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_field = funcs['field'] = function parse_field(context) {
        var cacheKey = "field" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result11 = parse_extendedAttributeList(context);
        var result2 = result11 !== null ? result11 : '';
        if (result2 !== null) {
          var result10 = parse_s(context);
          var result3 = result10 !== null ? result10 : '';
          if (result3 !== null) {
            var result4 = parse_type(context);
            if (result4 !== null) {
              var result5 = parse_s(context);
              if (result5 !== null) {
                var result6 = parse_identifier(context);
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    if (input.substr(pos, 1) === ";") {
                      var result8 = ";";
                      pos += 1;
                    } else {
                      var result8 = null;
                      if (context.reportMatchFailures) {
                        matchFailed(quoteString(";"));
                      }
                    }
                    if (result8 !== null) {
                      var result9 = parse_w(context);
                      if (result9 !== null) {
                        var result1 = [result2, result3, result4, result5, result6, result7, result8, result9];
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(extAttrs, type, name) { return { type: "field", extAttrs: extAttrs, idlType: type, name: name }; })(result1[0], result1[2], result1[4])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_extendedAttributeList = funcs['extendedAttributeList'] = function parse_extendedAttributeList(context) {
        var cacheKey = "extendedAttributeList" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_w(context);
        if (result2 !== null) {
          if (input.substr(pos, 1) === "[") {
            var result3 = "[";
            pos += 1;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("["));
            }
          }
          if (result3 !== null) {
            var result4 = parse_ExtAttrs(context);
            if (result4 !== null) {
              if (input.substr(pos, 1) === "]") {
                var result5 = "]";
                pos += 1;
              } else {
                var result5 = null;
                if (context.reportMatchFailures) {
                  matchFailed(quoteString("]"));
                }
              }
              if (result5 !== null) {
                var result6 = parse_w(context);
                if (result6 !== null) {
                  var result1 = [result2, result3, result4, result5, result6];
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(ea) { return ea; })(result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ExtAttrs = funcs['ExtAttrs'] = function parse_ExtAttrs(context) {
        var cacheKey = "ExtAttrs" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_ExtAttr(context);
        if (result2 !== null) {
          var result3 = [];
          var result4 = parse_ExtAttrsRest(context);
          while (result4 !== null) {
            result3.push(result4);
            var result4 = parse_ExtAttrsRest(context);
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(first, others) {   var ret = [first];
                      for (var i = 0, n = others.length; i < n; i++) { ret.push(others[i]); }
                      return ret; })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ExtAttrsRest = funcs['ExtAttrsRest'] = function parse_ExtAttrsRest(context) {
        var cacheKey = "ExtAttrsRest" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_w(context);
        if (result2 !== null) {
          if (input.substr(pos, 1) === ",") {
            var result3 = ",";
            pos += 1;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString(","));
            }
          }
          if (result3 !== null) {
            var result4 = parse_w(context);
            if (result4 !== null) {
              var result5 = parse_ExtAttr(context);
              if (result5 !== null) {
                var result1 = [result2, result3, result4, result5];
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(rest) { return rest; })(result1[3])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ExtAttr = funcs['ExtAttr'] = function parse_ExtAttr(context) {
        var cacheKey = "ExtAttr" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result5 = parse_ExtAttrArgList(context);
        if (result5 !== null) {
          var result1 = result5;
        } else {
          var result4 = parse_ExtAttrNamedArgList(context);
          if (result4 !== null) {
            var result1 = result4;
          } else {
            var result3 = parse_ExtAttrNameValue(context);
            if (result3 !== null) {
              var result1 = result3;
            } else {
              var result2 = parse_ExtAttrNoArg(context);
              if (result2 !== null) {
                var result1 = result2;
              } else {
                var result1 = null;;
              };
            };
          };
        }
        var result0 = result1 !== null
          ? (function(ea) { return ea; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ExtAttrNoArg = funcs['ExtAttrNoArg'] = function parse_ExtAttrNoArg(context) {
        var cacheKey = "ExtAttrNoArg" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result1 = parse_identifier(context);
        var result0 = result1 !== null
          ? (function(name) {return { name: name }; })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ExtAttrNameValue = funcs['ExtAttrNameValue'] = function parse_ExtAttrNameValue(context) {
        var cacheKey = "ExtAttrNameValue" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_identifier(context);
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            if (input.substr(pos, 1) === "=") {
              var result4 = "=";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("="));
              }
            }
            if (result4 !== null) {
              var result5 = parse_w(context);
              if (result5 !== null) {
                var result6 = parse_ScopedName(context);
                if (result6 !== null) {
                  var result1 = [result2, result3, result4, result5, result6];
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(name, value) {return { name: name, value: value }; })(result1[0], result1[4])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ExtAttrNamedArgList = funcs['ExtAttrNamedArgList'] = function parse_ExtAttrNamedArgList(context) {
        var cacheKey = "ExtAttrNamedArgList" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_identifier(context);
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            if (input.substr(pos, 1) === "=") {
              var result4 = "=";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("="));
              }
            }
            if (result4 !== null) {
              var result5 = parse_w(context);
              if (result5 !== null) {
                var result6 = parse_identifier(context);
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    if (input.substr(pos, 1) === "(") {
                      var result8 = "(";
                      pos += 1;
                    } else {
                      var result8 = null;
                      if (context.reportMatchFailures) {
                        matchFailed(quoteString("("));
                      }
                    }
                    if (result8 !== null) {
                      var result9 = parse_w(context);
                      if (result9 !== null) {
                        var result13 = parse_Arguments(context);
                        var result10 = result13 !== null ? result13 : '';
                        if (result10 !== null) {
                          var result11 = parse_w(context);
                          if (result11 !== null) {
                            if (input.substr(pos, 1) === ")") {
                              var result12 = ")";
                              pos += 1;
                            } else {
                              var result12 = null;
                              if (context.reportMatchFailures) {
                                matchFailed(quoteString(")"));
                              }
                            }
                            if (result12 !== null) {
                              var result1 = [result2, result3, result4, result5, result6, result7, result8, result9, result10, result11, result12];
                            } else {
                              var result1 = null;
                              pos = savedPos0;
                            }
                          } else {
                            var result1 = null;
                            pos = savedPos0;
                          }
                        } else {
                          var result1 = null;
                          pos = savedPos0;
                        }
                      } else {
                        var result1 = null;
                        pos = savedPos0;
                      }
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(name, value, args) {return { name: name, value: value, arguments: args }; })(result1[0], result1[4], result1[8])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      var parse_ExtAttrArgList = funcs['ExtAttrArgList'] = function parse_ExtAttrArgList(context) {
        var cacheKey = "ExtAttrArgList" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_identifier(context);
        if (result2 !== null) {
          var result3 = parse_w(context);
          if (result3 !== null) {
            if (input.substr(pos, 1) === "(") {
              var result4 = "(";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("("));
              }
            }
            if (result4 !== null) {
              var result5 = parse_w(context);
              if (result5 !== null) {
                var result9 = parse_Arguments(context);
                var result6 = result9 !== null ? result9 : '';
                if (result6 !== null) {
                  var result7 = parse_w(context);
                  if (result7 !== null) {
                    if (input.substr(pos, 1) === ")") {
                      var result8 = ")";
                      pos += 1;
                    } else {
                      var result8 = null;
                      if (context.reportMatchFailures) {
                        matchFailed(quoteString(")"));
                      }
                    }
                    if (result8 !== null) {
                      var result1 = [result2, result3, result4, result5, result6, result7, result8];
                    } else {
                      var result1 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result1 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(name, args) {return { name: name, arguments: args }; })(result1[0], result1[4])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function buildErrorMessage() {
        function buildExpected(failuresExpected) {
          switch (failuresExpected.length) {
            case 0:
              return 'end of input';
            case 1:
              return failuresExpected[0];
            default:
              failuresExpected.sort();
              return failuresExpected.slice(0, failuresExpected.length - 1).join(', ')
                + ' or '
                + failuresExpected[failuresExpected.length - 1];
          }
        }
        
        var expected = buildExpected(rightmostMatchFailuresExpected);
        var actualPos = Math.max(pos, rightmostMatchFailuresPos);
        var actual = actualPos < input.length
          ? quoteString(input.charAt(actualPos))
          : 'end of input';
        
        return 'Expected ' + expected + ' but ' + actual + ' found.';
      }
      
      function computeErrorPosition() {
        /*
         * The first idea was to use |String.split| to break the input up to the
         * error position along newlines and derive the line and column from
         * there. However IE's |split| implementation is so broken that it was
         * enough to prevent it.
         */
        
        var line = 1;
        var column = 1;
        var seenCR = false;
        
        for (var i = 0; i <  rightmostMatchFailuresPos; i++) {
          var ch = input.charAt(i);
          if (ch === '\n') {
            if (!seenCR) { line++; }
            column = 1;
            seenCR = false;
          } else if (ch === '\r' | ch === '\u2028' || ch === '\u2029') {
            line++;
            column = 1;
            seenCR = true;
          } else {
            column++;
            seenCR = false;
          }
        }
        
        return { line: line, column: column };
      }
      
      
      
      var result = funcs[start]({ reportMatchFailures: true });
      
      /*
       * The parser is now in one of the following three states:
       *
       * 1. The parser successfully parsed the whole input.
       *
       *    - |result !== null|
       *    - |pos === input.length|
       *    - |rightmostMatchFailuresExpected| may or may not contain something
       *
       * 2. The parser successfully parsed only a part of the input.
       *
       *    - |result !== null|
       *    - |pos < input.length|
       *    - |rightmostMatchFailuresExpected| may or may not contain something
       *
       * 3. The parser did not successfully parse any part of the input.
       *
       *   - |result === null|
       *   - |pos === 0|
       *   - |rightmostMatchFailuresExpected| contains at least one failure
       *
       * All code following this comment (including called functions) must
       * handle these states.
       */
      if (result === null || pos !== input.length) {
        var errorPosition = computeErrorPosition();
        throw new this.SyntaxError(
          buildErrorMessage(),
          errorPosition.line,
          errorPosition.column
        );
      }
      
      return result;
    },
    
    /* Returns the parser source code. */
    toSource: function() { return this._source; }
  };
  
  /* Thrown when a parser encounters a syntax error. */
  
  result.SyntaxError = function(message, line, column) {
    this.name = 'SyntaxError';
    this.message = message;
    this.line = line;
    this.column = column;
  };
  
  result.SyntaxError.prototype = Error.prototype;
  
  return result;
})();
