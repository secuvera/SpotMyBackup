var conf = config;

window.onload = function() {
  var target = window.self === window.top ? window.opener : window.parent;
  var hash = window.location.hash;
  if (hash) {
    var token = window.location.hash.split('&')[0].split('=')[1];
    target.postMessage(token, conf.uri); //embedded
  }
};
