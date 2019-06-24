var conf = config;

var authWindow = null;
var token = null;
var userId = '';
var collections = {};
var name = 'spotify';

var isImporting = false;
var isExporting = false;
var globalStep = "";
var playlistStep = 0;
var trackStep = 0;
var trackTotal = 0;

var playlistQueue = [];
var savedQueue = [];

var makingChanges = false;

function refreshTrackData(callback) {
    if (!isExporting && !isImporting) {
        isExporting = true;
        resetCounter();
        $('#pnlLoadingAccount').show();
        $('#loadingTitle').html('Please wait. Loading your playlists and tracks ...');
        refreshPlaylist(function () {
            refreshMyMusicTracks(function () {
                // refreshStarredTracks(function () {
                    $('#loadingTitle').html('Finished loading, you now might want to export or import.');
                    isExporting = false;
                    callback();
                // });
            });
        }); 
    }
}

function resetCounter() {
    globalStep = '';
    playlistStep = 0;
    playlistTotal = 0;
    trackStep = 0;
    trackTotal = 0;
}

function refreshProgress() {
    $('#globalStep').html(globalStep);
    $('#playlistStep').html(playlistStep);
    $('#playlistTotal').html(playlistTotal);
    $('#trackStep').html(trackStep);
    $('#trackTotal').html(trackTotal);
    var progress = 0;
    if (trackTotal > 0) {
        var progress = Math.floor(((trackStep / trackTotal) * 100));
    }
    $('#progressBar').css('width', progress+'%')
    if (typeof collections !== 'undefined' && !makingChanges) {
        var set = collectionProperties(collections);
        $('#loadingPlaylists').html(""+set.playlistCount+" playlists");
        $('#loadingTracks').html(""+set.trackCount+" tracks");
    }
    if (typeof importColl !== 'undefined') {
        var set2 = collectionProperties(importColl);
        $('#filePlaylists').html(""+set2.playlistCount+" playlists");
        $('#fileTracks').html(""+set2.trackCount+" tracks");
    }
    setTimeout(refreshProgress, 1000);
}

function login() {
    var width = 480, height = 640;
    var left = (screen.width / 2) - (width / 2);
    var top = (screen.height / 2) - (height / 2);

    var set = {
      client_id: conf.client_id,
      redirect_uri: conf.redirect_uri,
      scope: 'playlist-read playlist-read-private playlist-modify-public playlist-modify-private user-library-read user-library-modify',
      response_type: 'token',
      show_dialog: 'true'
    };
    authWindow = window.open(
        "https://accounts.spotify.com/authorize?" + urlEncodeSet(set),
        "Spotify",
        'menubar=no,location=no,resizable=no,scrollbars=no,status=no, width=' + width + ', height=' + height + ', top=' + top + ', left=' + left
    );
}

function authCallback(event){
    if (event.origin !== conf.uri) {
        console.log("config.uri missconfigured:");
        console.log({ uri: conf.uri, origin: origin });
        return;
    }
    if (authWindow) {
        authWindow.close();
    }
    handleAuth(event.data);
}

function urlEncodeSet(set) {
    var comps = [];
    for (var i in set) {
        if (set.hasOwnProperty(i)) {
            comps.push(encodeURIComponent(i)+"="+encodeURIComponent(set[i]));
        }
    }
    var string = comps.join("&");
    return string;
}

function download(filename, text) {
    var pom = document.createElement('a');
    pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    pom.setAttribute('download', filename);

    if (document.createEvent) {
        var event = document.createEvent('MouseEvents');
        event.initEvent('click', true, true);
        pom.dispatchEvent(event);
    }
    else {
        pom.click();
    }
}

function readFile(evt) {
    //Retrieve the first (and only!) File from the FileList object
    var f = evt.target.files[0]; 

    if (f) {
        $('#fileName').html(f.name);

        var r = new FileReader();
        r.onload = function(e) { 
            var json = e.target.result;

            importColl = JSON.parse(json);

            $('#pnlFile').hide();
            $('#pnlFileInfo').show();
            $('#pnlUpload').show();

            compareEverything();
        }
        r.readAsText(f);
    } else { 
      alert("Failed to load file");
    }
}

function collectionProperties(coll) {
    return { playlistCount: collPlaylistCount(coll), trackCount: collTrackCount(coll) };
}

function collTrackCount(coll) {
    var count = 0;
    var keys = _.keys(coll.playlists);
    $.each(keys, function (index, value) {
        count += coll.playlists[value].tracks.length;
    });
    if (coll.starred) {
        count += coll.starred.length;
    }
    if (coll.saved) {
        count += coll.saved.length;
    }
    return count;
}

function collPlaylistCount(coll) {
    var keys = _.keys(coll.playlists);
    var count = keys.length + 1;
    if (!("importedStarred" in keys)) {
        count++;
    }
    return count;
}

function compareEverything() {
    if (!isImporting && !isExporting) {
        isImporting = true;
        makingChanges = true;
        resetCounter();

        savedQueue = [];
        playlistQueue = [];

        globalStep = "Uploading";
        if (typeof importColl !== 'undefined') {

            playlistTotal = collPlaylistCount(importColl);            

            // TONOTDO:compare starred -> can not really do that since there is no api to manipulate those
            // instead we just create a replacement-standard-list
            globalStep = "Comparing starred tracks";
            
            makeSureImportedStarredExists(function (proceed) {
                if (importColl.starred && importColl.starred.length > 0) {
                    compareUriTracks(importColl.starred, collections.starred, addToStarred);
                }
                // compare saved
                globalStep = "Comparing saved tracks";
                compareIdTracks(importColl.saved, collections.saved, addToSaved);
                playlistStep += 1;

                // compare other playlists
                var playlistNames = _.keys(importColl.playlists);
                globalStep = "Comparing custom playlists";
                handlePlaylistCompare(playlistNames.reverse(), function () {
                    handleTrackUpload();
                });
            });
        }
    }
}

function handleTrackUpload() {

    trackDiff = savedQueue.length + playlistQueue.length;
    trackTotal = Math.max(collTrackCount(importColl), trackDiff);
    trackStep = trackTotal - trackDiff;


    if (trackTotal > 0) {
        $('#progressBar').show();
        globalStep = "Uploading tracks";
        handleSavedRequests(savedQueue.reverse(), function () {
            handlePlaylistRequests(playlistQueue.reverse(), function () {
                globalStep = "Finished uploading";
                trackTotal = trackStep;
                isImporting = false;
            });
        });
    } else {
        globalStep = "No new tracks found in import";
    }
}

function handlePlaylistCompare(names, callback) {
    var name = names.pop();
    if (!name) {
        callback();
        return;
    }
    makeSurePlaylistExists(name, function (proceed) {
        if (proceed) {
            var playlistId = collections.playlists[name].id;
            compareUriTracks(importColl.playlists[name].tracks, collections.playlists[name].tracks, function (uri) {
                addToPlaylist(playlistId, uri);
            });
        }
        handlePlaylistCompare(names, callback);
    });
}

function addToPlaylist(playlistId, trackUri) {
    playlistQueue.push('https://api.spotify.com/v1/users/' + userId + '/playlists/' + playlistId + '/tracks?uris=' + encodeURIComponent(trackUri));
}

function makeSurePlaylistExists(name, callback) {
    playlistStep += 1;
    if (name in collections.playlists) {
        callback(true);
        return;
    }
    var set = { name: name, public: "true" };
    $.ajax({
        method: "POST",
        url: 'https://api.spotify.com/v1/users/' + userId + '/playlists',
        data: JSON.stringify(set),
        contentType: 'application/json',
        headers: {
        'Authorization': 'Bearer ' + token
        },
        success: function(response) {         
            // alert(JSON.stringify(response));
            collections.playlists[response.name] = {
                name: response.name,
                href: response.tracks.href,
                id: response.id,
                tracks: []
            };
            callback(true);
        },
        fail: function () {
            callback(false);
        }
    });
}

function makeSureImportedStarredExists(callback) {
    var name = 'importedStarred';
    makeSurePlaylistExists(name, callback);
}

function addToStarred(trackUri) {
    var name = 'importedStarred';
    var playlistId = collections.playlists[name].id;
    uriInTracks(trackUri, collections.playlists[name].tracks, function (uri) {
        addToPlaylist(playlistId, uri);
    });
}

function handleSavedRequests(arr, callback) {
    var url = arr.pop();
    if (url) {
        trackStep += 1;
        $.ajax({
            method: "PUT",
            url: url,
            headers: {
            'Authorization': 'Bearer ' + token
            },
            success: function () {
            },
            fail: function (jqXHR, textStatus, errorThrown) {
                console.log(errorThrown);
            }
        })
        .always(function () {
            handleSavedRequests(arr, callback);
        });
    } else {
        callback();
    }
}


function handlePlaylistRequestsWithTimeout(arr, callback) {
        setTimeout(function() { console.log("Fast runners are dead runners"); handlePlaylistRequests(arr, callback) }, conf.slowdown_import);
}

function handlePlaylistRequests(arr, callback) {
    var url = arr.pop();
    if (url) {
        trackStep += 1;   
        $.ajax({
            method: "POST",
            url: url,
            contentType: 'application/json',
            headers: {
            'Authorization': 'Bearer ' + token
            },
            success: function(response) {      
                // collections.playlists[response.name] = {
                //     id: response.id,
                //     uri: response.uri
                // };
            },
            fail: function (jqXHR, textStatus, errorThrown) {
                console.log(errorThrown);
            }
        })
        .always(function () {
            handlePlaylistRequestsWithTimeout(arr, callback);
        })
    } else {
        callback();
    }
}

function uriInTracks(uri, tracks, addCallback) {
    var found = false;
    $.each(tracks, function (index, value) {
        if (value.uri == uri) {
            found = true;
        }
    });
    if (!found) {
        addCallback(uri);
    }
}

function addToSaved(id) {
    savedQueue.push('https://api.spotify.com/v1/me/tracks?ids='+id);
}

function compareUriTracks(imported, stored, addCallback) {
    $.each(imported, function (index, value) {
        var found = false;
        $.each(stored, function (index2, value2) {
            if (value.uri == value2.uri) {
                found = true;
            }
        });
        if (!found) {
            addCallback(value.uri);
        }
    });
}

function compareIdTracks(imported, stored, addCallback) {
    $.each(imported, function (index, value) {
        var found = false;
        $.each(stored, function (index2, value2) {
            if (value.id == value2.id) {
                found = true;
            }
        });
        if (!found) {
            addCallback(value.id);
        }
    });
}

function bindControls() {
    $('#btnImport').click(function () {
        $('#pnlAction').hide();
        $('#pnlImport').show();
    });
    $('#btnExport').click(function () {
        var json = JSON.stringify(collections);
        var d = new Date();
        var time = '@' + d.getFullYear() + '_' + (d.getMonth() + 1) + '_' + d.getDate();
        download(name+time+'.json', json);
    });
    $('#fileImport').change(readFile);
}

function handleAuth(accessToken) {
    token = accessToken;
    // fetch my public playlists
    $.ajax({
        url: 'https://api.spotify.com/v1/me',
        headers: {
        'Authorization': 'Bearer ' + accessToken
        },
        success: function(response) {         
            var user_id = response.id.toLowerCase();
            userId = user_id;
            name = user_id;

            $('#userName').html(name);
            $('#pnlLoggedOut').hide();

            refreshTrackData(function () {                   
                $('#pnlAction').show();
            });
        }
    });
}

function refreshMyMusicTracks(callback) {
    collections.saved = [];
    playlistStep += 1;
    loadTrackChunks('https://api.spotify.com/v1/me/tracks', collections.saved, callback);
}

// DEPRECATED
// function refreshStarredTracks(callback) {
//     collections.starred = [];
//     playlistStep += 1;
//     loadStarred('https://api.spotify.com/v1/users/' + userId + '/starred', collections.starred, callback)
// }

// DEPRECATED
// function loadStarred(url, arr, callback) {
//     $.ajax({
//         url: url,
//         headers: {
//             'Authorization': 'Bearer ' + token
//         },
//         success: function(data) {         
//             if (!data) return;
//             if ('tracks' in data) {
//                 loadTrackChunks(data.tracks.href, arr, callback);
//             } else {
//                 callback();
//             }                
//         }
//     });
// }

function loadTrackChunksWithTimeout(url, arr, callback, timeout) {
        setTimeout(function() { console.log("Taking breath, not to fast my cheetah"); loadTrackChunks(url, arr, callback) }, conf.slowdown_export);
}

function loadTrackChunks(url, arr, callback) {
    $.ajax({
        url: url,
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function (data) {
            if (!data) return;
            if ('items' in data) {
                $.each(data.items, function (index, value) {
                    if(value.track !== null){
                        arr.push({ id: value.track.id, uri: value.track.uri });    
                    }else{
                        console.log("track is null", value);
                    }                    
                });
            } else {
                arr.push({ id: data.track.id, uri: data.track.uri });
            }
            if (data.next) {
                loadTrackChunksWithTimeout(data.next, arr, callback);
            } else {
                callback();
            }
        }
    });
}

function refreshPlaylist(callback) {
    collections.playlists = {};
    var playlists = [];
    loadPlaylistChunks('https://api.spotify.com/v1/users/' + userId + '/playlists', playlists, function () {
        handlePlaylistTracks(playlists, collections.playlists, callback);
    });
}

function loadPlaylistChunks(url, arr, callback) {
    $.ajax({
        url: url,
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function (data) {
            if (!data) return;
            if ('items' in data) {
                $.each(data.items, function (index, value) {
                    if (value.tracks && value.tracks.href) {
                        arr.push({
                            name: value.name,
                            href: value.tracks.href,
                            id: value.id,
                            tracks: []
                        });
                    }
                });
            } else {
                if (data.tracks && data.tracks.href) {
                    arr.push({
                        name: data.name,
                        href: data.tracks.href,
                        id: value.id,
                        tracks: []
                    });
                }
            }
            if (data.next) {
                loadPlaylistChunks(data.next, arr, callback);
            } else {
                callback();
            }
        }
    });
}

function handlePlaylistTracks(arr, result, callback) {
    var item = arr.pop();
    if (!item) {
        return callback();
    }
    playlistStep += 1;
    item.tracks = [];
    loadTrackChunks(item.href, item.tracks, function () {
        delete item.href;
        result[item.name] = item;
        if (arr.length == 0) {
            callback();
        } else {
            handlePlaylistTracks(arr, result, callback);
        }
    });
}

window.onload = function() {
    if (navigator.userAgent.indexOf('MSIE') !== -1 || navigator.appVersion.indexOf('Trident/') > 0) {
        // MSIE
        $('#pnlLoggedOut').html('Please use Firefox or Chrome, due to a bug in Internet Explorer');
    } else {
        $('#login').click(login);
        window.addEventListener("message", authCallback, false);
        bindControls();
        refreshProgress();
    }
}