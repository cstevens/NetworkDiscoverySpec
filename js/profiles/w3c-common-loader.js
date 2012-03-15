// use this instead of w3c-common if you are a ReSpec developer and want to move
// between using ReSpec locally or from a Web server

(function () {
    var scs = document.getElementsByTagName("script"),
        baseURL = "";
    for (var i = 0, n = scs.length; i < n; i++) {
        var s = scs[i],
            src = s.getAttribute("src");
        if (!src) continue;
        if (src.indexOf("w3c-common-loader.js") > -1) {
            baseURL = src.replace("profiles/w3c-common-loader.js", "");
            break;
        }
    }
    
    var script = document.createElement("script"),
        head   = document.getElementsByTagName("head")[0];
    script.setAttribute("class", "remove");
    if (document.location.href.indexOf("file:") === 0) {
        // load proper profile version
        script.src = baseURL + "profiles/w3c-common.js";
    }
    else {
        // load development version
        script.src = baseURL + "require.js";
        script.setAttribute("data-main", "w3c/profile-common");
    }
    head.appendChild(script);
})();

