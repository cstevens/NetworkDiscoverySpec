// script used by local proxy documents so that resources may be loaded from the local
// disk when working offline
window.addEventListener("message", function dataRequested (ev) {
    try {
        var id = ev.data.substring(0, ev.data.indexOf(","));
        var data = ev.data.substring(ev.data.indexOf(",") + 1);
        var src = data.replace(/^.*\//, "");
        var back = ev.source;
        $.ajax({
            async:  true,
            url:    src,
            dataType:   "text",
            complete:   function (xhr) {
                if (xhr.responseText)   back.postMessage(id + "," + xhr.responseText, "*");
                else                    back.postMessage(id + ",", "*");
            }
        });
    }
    catch (e) {
        alert("EX: " + e);
    }
}, false);
