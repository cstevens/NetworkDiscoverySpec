// XXX untested
//  Shane's RDFa markup
// @@ CONFIG
//      - diffTool
//      - previousDiffURI
//      - previousURI
define(
    ["core/utils"],
    function (utils) {
        return {
            run:    function (conf, doc, cb) {
                progress("RDFa");

                $("#abstract", doc).each(function(i, abs) {
                    $(abs).attrAppend('property', 'dcterms:absract') ;
                    $(abs).attr('datatype', '') ;
                })
                
                // annotate sections with Section data
                $("section", doc).each(function(i, sec) {
                    // Note section should already have an ID, if this is run after core/structure
                    if (!$(sec).attr('about')) {$(sec).attr('about', '#' + $(sec).attr('id'))}

                    $(sec).attrAppend('typeof', 'bibo:Chapter') ;
                })
                
                // Root attr
                // Add prefix attributes to define namespaces
                var prefix = "dc: http://purl.org/dc/terms/ bibo: http://purl.org/ontology/bibo/ foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#";
                $("html", doc)
                    .attr("about", "")
                    .attr("property", "dc:language")
                    .attr("content", "en") ;
                
                // Can't write prefix using "attr" on body, as it sets the prefix of the element!
                doc.documentElement.setAttribute("prefix", prefix)

                // Update Author and Editor information (must be done after w3c/headers or equivalent)
                $("dd.Editor", doc).each(function(i, dd) {
                    $(dd).attrAppend('rel', 'bibo:editor');
                    
                    // Name with homepage
                    $(dd).children('a.name').each(function(j, a) {
                        $(a).attr('rel', 'foaf:homepage');
                        $(a).attr('property', 'foaf:name');
                        $(a).attr('content', $(a).text());
                    })
                    
                    // Name without homepage
                    $(dd).children('span.name').attr('property', 'foaf:name');
                    
                    // Workplace with homepage
                    $(dd).children('a.company').attr('rel', 'foaf:workplaceHomepage');

                    // Mailbox
                    $(dd).children('a.email').attr('rel', 'foaf:mbox');
                    
                    // Wrap the lot in type
                    $(dd).wrapInner("<span typeof='foaf:Person'>") ;
                })
                
                // Previous Version
                $('dt:contains("Previous version") + dd a', doc).attr('rel', 'dc:replaces');
                
                // Title and such
                $('h1.title', doc).attrAppend('rel', 'dc:title');
                $('h2.subtitle', doc).attrAppend('rel', 'bibo:subtitle');
                $('p.copyright a.license', doc).attr('rel', 'license');
                $('p.copyright a.publisher', doc).each(function(i, a) {
                    var title = $(a).text();
                    $(a).attr('rel', 'foaf:homepage')
                        .attr('property', 'foaf:name')
                        .attr('content', title)
                        .wrap("<span rel='dcterms:publisher'><span typeof='foaf:Organization/></span>");
                })

                // Bibliography references
                $('dl.bibliography').attr('about', '');
                
                $('#normative-references dl.bibliography dd', doc).attr('rel', 'dc:requires')
                $('#informative-references dl.bibliography dd', doc).attr('rel', 'dc:references')

                cb();
            },
            ieDummy: 1
        };
    }
);
