// XXX untested
// @@@ CONF
//  - normativeReferences
//  - informativeReferences
//  - refNote

// - build the bibref in JSON-P?
  
define(
    ["core/utils"],
    function (utils) {
        return {
            run:    function (conf, doc, cb) {
                progress("inserting bibrefs");
                if (!conf.normativeReferences) conf.normativeReferences = [];
                if (!conf.informativeReferences) conf.informativeReferences = [];
                
                // use the refs detected during inlines (put in conf) to build the refs section
                var informs = utils.unique(conf.informativeReferences),
                    norms = utils.unique(conf.normativeReferences);
                if (!informs.length && !norms.length) {
                    cb();
                    return;
                }
                var keep = [];
                for (var i = 0; i < informs.length; i++) {
                    if (!$.inArray(informs[i], norms) > -1) keep.push(informs[i]);
                }
                informs = keep;
                
                var $refsec = $("<section id='references' class='appendix'/>").appendTo($("body"), doc)
                                                                              .append("<h2>References</h2>");
                if (conf.refNote) $refsec.html("<p/>").find("p").html(refNote);
                
                var types = ["Normative", "Informative"];
                for (var i = 0; i < types.length; i++) {
                    var type = types[i];
                    var refList = (type == "Normative") ? norms : informs;
                    if (refList.length == 0) continue;
                    var $sec = $("<section/>").appendTo($refsec)
                                              .attr("id", type.toLowerCase() + "-references")
                                              .append("<h3>")
                                              .find("h3")
                                                .text(type + " references")
                                              .end();
                    refList.sort();
                    var $dl = $("<dl class='bibliography'/>").appendTo($sec);
                    for (var j = 0, n = refList.length; j < n; j++) {
                        var ref = refList[j];
                        $("<dt/>").attr({id: "bib-" + ref}).appendTo($dl).text("[" + ref + "]");
                        var $dd = $("<dd><em>waiting for reference to load...</em></dd>").appendTo($dl);
                        // utils.proxyLoad(conf.respecBase + "bibref/" + ref + ".html", this._makeCB(ref));
                        require({ baseUrl: conf.respecBase }, ["w3c/bibref/" + ref], function (def) {
                            $("#bib-" + def.id).next().html(def.html);
                            $("script[data-requiremodule=\"w3c/bibref/" + def.id + "\"]").remove();
                        });
                    }
                }
                
                cb();
            },
            ieDummy: 1
        };
    }
);
