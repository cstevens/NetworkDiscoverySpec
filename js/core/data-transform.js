define(
    ["core/utils"],
    function (utils) {
        return {
            run:    function (conf, doc, cb) {
                progress("running data transforms");
    	        var root = $(doc.documentElement);
                root.find("[data-transform]").each(function (i, node) {
                    var content = node.innerHTML;
                    var flist = node.getAttribute('data-transform');
                    node.removeAttribute('data-transform') ;
                    var content = utils.runTransforms(content, flist);
                    if (content) {
                        node.innerHTML = content ;
                    }
                });
                cb();
            },
            ieDummy: 1
        };
    }
);
