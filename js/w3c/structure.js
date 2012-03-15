// XXX untested
define(
    [],
    function () {
        return {
            run:    function (conf, doc, cb) {
                progress("flagging informative");
                $("section.informative").find("h2:first, h3:first, h4:first, h5:first, h6:first")
                                        .after("<em>This section is non-normative.</em>");

                // idHeaders
                $("h2, h3, h4, h5, h6").each(function (i, h) {
                    if (!$(h).attr("id")) {
                        var par = h.parentNode;
                        if (par.localName.toLowerCase() == "section" && par.hasAttribute("id") && !h.previousElementSibling) return;
                        $(h).makeID();
                    }
                });

                cb();
            },
            ieDummy: 1
        };
    }
);
