// XXX untested
// XXX also handle abstract and sotd here, it's the same logical unit (especially for configuration)
// @@ configuratoin
//  - lots of configuration to list...
define(
    ["core/tt", "core/utils", "text!w3c/templates/headers.html"],
    function (tt, utils, template) {
        return {
            status2text: {
                NOTE:           "Note",
                "WG-NOTE":      "Working Group Note",
                "CG-NOTE":      "Co-ordination Group Note",
                "IG-NOTE":      "Interest Group Note",
                "Member-SUBM":  "Member Submission",
                "Team-SUBM":    "Team Submission",
                XGR:            "Incubator Group Report",
                MO:             "Member-Only Document",
                ED:             "Editor's Draft",
                FPWD:           "Working Draft",
                WD:             "Working Draft",
        		"FPWD-NOTE":    "Working Draft",
                "WD-NOTE": 		"Working Draft", 
        		"LC-NOTE":      "Working Draft", 
                LC:             "Working Draft",
                CR:             "Candidate Recommendation",
                PR:             "Proposed Recommendation",
                PER:            "Proposed Edited Recommendation",
                REC:            "Recommendation",
                RSCND:          "Rescinded Recommendation",
                unofficial:     "Unofficial Draft",
                base:           "Document"
            },
            status2maturity: {
                FPWD:       "WD",
                LC:         "WD",
        		"FPWD-NOTE":"WD", 
               	"WD-NOTE":  "WD", 
        		"LC-NOTE":  "LC",
                "WG-NOTE":  "NOTE"
            },
            status2long:    {
                FPWD:           "First Public Working Draft",
        		"FPWD-NOTE": 	"First Public Working Draft", 
                LC:             "Last Call Working Draft",
                "LC-NOTE": 		"Last Call Working Draft"
            },
            recTrackStatus: ["FPWD", "WD", "LC", "CR", "PR", "PER", "REC"],
            noTrackStatus:  ["MO", "unofficial", "base"],
            
            run:    function (conf, doc, cb) {
                progress("adding document headers");
                
                for (var k in this.status2text) {
                    if (this.status2long[k]) continue;
                    this.status2long[k] = this.status2text[k];
                }

                // --- CONFIGURATION PROCESSING
                if (!conf.specStatus) error("Missing required configuration: specStatus");
                conf.specStatusText = this.status2text[conf.specStatus];
                conf.title = doc.title ? doc.title : "No Title";
                if (!conf.subtitle) conf.subtitle = "";
                if (!conf.publishDate) {
                    conf.publishDate = utils.parseLastModified(doc.lastModified);
                    // the above is experimental, use this if it fails:
                    // conf.publishDate = new Date();
                }
                else {
                    if (!(conf.publishDate instanceof Date)) conf.publishDate = utils.parseSimpleDate(conf.publishDate);
                }
                conf.publishYear = conf.publishDate.getFullYear();
                conf.publishHumanDate = utils.humanDate(conf.publishDate);
                if (!conf.shortName) error("Missing required configuration: shortName");
                if (!conf.edDraftURI) {
                    conf.edDraftURI = "";
                    if (conf.specStatus === "ED") warn("Editor's Drafts should set edDraftURI.");
                }
                conf.maturity = (this.status2maturity[conf.specStatus]) ? this.status2maturity[conf.specStatus] : conf.specStatus;
                conf.thisVersion = "http://www.w3.org/TR/" + conf.publishDate.getFullYear() + "/" + conf.maturity + "-" +
                                   conf.shortName + "-" + utils.concatDate(conf.publishDate) + "/";
                if (conf.specStatus == "ED") conf.thisVersion = conf.edDraftURI;
                conf.latestVersion = "http://www.w3.org/TR/" + conf.shortName + "/";
                if (conf.previousPublishDate) {
                    if (!conf.previousMaturity) error("previousPublishDate is set, but not previousMaturity");
                    if (!(conf.previousPublishDate instanceof Date)) 
                        conf.previousPublishDate = utils.parseSimpleDate(conf.previousPublishDate);
                    var pmat = (this.status2maturity[conf.previousMaturity]) ? this.status2maturity[conf.previousMaturity] : 
                                                                               conf.previousMaturity;
                    conf.prevVersion = "http://www.w3.org/TR/" + conf.previousPublishDate.getFullYear() + "/" + pmat + "-" +
                                       conf.shortName + "-" + utils.concatDate(conf.previousPublishDate) + "/";
                }
                else {
                    if (conf.specStatus != "FPWD" && conf.specStatus != "ED" && !conf.isNoTrack)
                        error("Document on track but no previous version.");
                    conf.prevVersion = "";
                }
                conf.isRecTrack = conf.noRecTrack ? false : $.inArray(conf.specStatus, this.recTrackStatus) >= 0;
                conf.isNoTrack = $.inArray(conf.specStatus, this.noTrackStatus) >= 0;
                if (!conf.prevED) conf.prevED = "";
                if (!conf.prevRecShortname) conf.prevRecShortname = "";
                if (!conf.prevRecURI) conf.prevRecURI = "";
                if (!conf.editors || conf.editors.length === 0) error("At least one editor is required");
                if (!conf.authors) conf.authors = [];
                var peopCheck = function (i, it) {
                    if (!it.name) error("All authors and editors must have a name.");
                    if (!it.uri) it.uri = "";
                    if (!it.company) it.company = "";
                    if (!it.companyURL) it.companyURL = "";
                    if (!it.mailto) it.mailto = "";
                    if (!it.note) it.note = "";
                };
                $.each(conf.editors, peopCheck);
                $.each(conf.authors, peopCheck);
                if (!conf.errata) conf.errata = "";
                if (!conf.alternateFormats) conf.alternateFormats = "";
                else {
                    $.each(conf.alternateFormats, function (i, it) {
                        if (!it.uri || !it.label) error("All alternate formats must have a uri and a label.");
                    });
                }
                if (!conf.additionalCopyrightHolders) conf.additionalCopyrightHolders = "";
                if (!conf.copyrightStart) conf.copyrightStart = "";

                var $sotd = $("#sotd");
                if ($sotd.length) {
                    conf.custom = $sotd.html();
                    $sotd.remove();
                }
                else {
                    if (conf.isRecTrack) {
                        warn("Rec-track documents should have a custom SotD paragraph.")
                        conf.custom = "";
                    }
                    else {
                        conf.custom = "";
                    }
                }
                if (conf.specStatus != "unofficial" && !conf.isNoTrack) {
                    if (!conf.wgURI || !conf.wg || !conf.wgPublicList || !conf.wgPatentURI)
                        error("All of the following must be configured: wgURI, wg, wgPublicList, wgPatentURI");
                }
                if (conf.specStatus === "LC") {
                    if (!conf.lcEnd) error("LC drafts must have lcEnd set.");
                    conf.humanLCEnd = utils.humanDate(conf.lcEnd);
                }
                if (conf.specStatus === "CR") {
                    if (!conf.crEnd) error("CR drafts must have crEnd set.");
                    conf.humanCREnd = utils.humanDate(conf.crEnd);
                }
                conf.longStatus = this.status2long[conf.specStatus];
                progress("headers configuration done");

                // --- RUN THE TEMPLATES
                tt.loadFromHTML(template, doc);
                progress("running TT for headers");
                // headers
                $("body", doc).prepend($(tt.exec("w3c-headers", conf)));

                // abstract
                progress("handling abstract");
                var $abs = $("#abstract");
                if (!$abs) error("Document must have one element with ID 'abstract'");
                $abs.prepend("<h2>Abstract</h2>");
                $abs.addClass("introductory");
                
                // SotD
                progress("running template for sotd");
                $abs.after($(tt.exec("w3c-sotd", conf)));
                
                // conformance
                progress("handling conformance");
                var $confo = $("#conformance");
                if ($confo) {
                    $confo.prepend($(tt.exec("w3c-conformance", conf)));
                    $confo.prepend("<h2>Conformance</h2>");
                }
                
                progress("done adding document headers");
                cb();
            },
            ieDummy: 1
        };
    }
);
