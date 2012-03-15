// XXX untested
//  Shane's diff marking
// @@ CONFIG
//      - diffTool
//      - previousDiffURI
//      - previousURI
define(
    ["core/utils"],
    function (utils) {
        return {
            run:    function (conf, doc, cb) {
                progress("Diff tool");
                var self = this;

                conf.diffTool = conf.diffTool || "http://www.aptest.com/standards/htmldiff/htmldiff.pl";
                var diffURI = conf.previousDiffURI || conf.prevVersion;
                if (diffURI) {
                    utils.registerSaveAction("Diffmark", function () {
                        utils.hideSaveOptions(); self.toDiffHTML(conf, diffURI);
                    })
                 }
                cb();
            },
            toDiffHTML:     function(conf, diffURI) {
                // create a diff marked version against the previousURI
                // strategy - open a window in which there is a form with the
                // data needed for diff marking - submit the form so that the response populates 
                // page with the diff marked version
                var base = window.location.href;
                base = base.replace(/\/[^\/]*$/, "/");

                var str = "";
                str += "<body><form name='form' method='POST' action='" + conf.diffTool + "'>\n";
                str += "<input type='hidden' name='base' value='" + base + "'>\n";
                str += "<input type='hidden' name='oldfile' value='" + diffURI + "'>\n"; 
                str += '<input type="hidden" name="newcontent" value="' + utils.esc(utils.stringifyHTML()) + '">\n';
                str += '<p>Please wait...</p>';
                str += "</form>\n";

                var x = window.open() ;
                x.document.write(str) ;
                x.document.close() ;
                x.document.form.submit() ;
            },
            ieDummy: 1
        };
    }
);
