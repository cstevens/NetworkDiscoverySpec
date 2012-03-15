
define(
    ["core/tt", "core/utils", "text!robineko/templates/headers.html"],
    function (tt, utils, template) {
        return {
            run:    function (conf, doc, cb) {
                progress("adding document headers");
                
                // --- CONFIGURATION PROCESSING
                conf.title = doc.title ? doc.title : "No Title";
                if (!conf.subtitle) conf.subtitle = "";
                if (!conf.publishDate) {
                    conf.publishDate = utils.parseLastModified(doc.lastModified);
                }
                else {
                    if (!(conf.publishDate instanceof Date)) conf.publishDate = utils.parseSimpleDate(conf.publishDate);
                }
                conf.publishYear = conf.publishDate.getFullYear();
                conf.dashDate = utils.concatDate(conf.publishDate, "-");

                if (!conf.editors || conf.editors.length === 0) error("At least one editor is required");
                var peopCheck = function (i, it) {
                    if (!it.name) error("All authors and editors must have a name.");
                    if (!it.uri) it.uri = "";
                    if (!it.company) it.company = "";
                    if (!it.companyURL) it.companyURL = "";
                    if (!it.mailto) it.mailto = "";
                    if (!it.note) it.note = "";
                };
                $.each(conf.editors, peopCheck);

                // --- RUN THE TEMPLATES
                tt.loadFromHTML(template, doc);
                progress("running TT for headers");
                // headers
                $("body", doc).prepend($(tt.exec("robineko-headers", conf)));

                // abstract
                progress("handling abstract");
                var $abs = $("#abstract");
                if (!$abs) error("Document must have one element with ID 'abstract'");
                $abs.addClass("introductory");
                
                progress("done adding document headers");
                cb();
            },
            ieDummy: 1
        };
    }
);
