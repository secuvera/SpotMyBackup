// @todo if jquery loaded, {login, callback}.html need it too
class App {
    constructor() {
        this.configurationFile = 'config.json';
        this.authWindow = null;

        this.settings = {
            uri: "http://localhost:8888",
            redirect_uri: "http://localhost:8888/login.html",
            client_id: "",

            filename: "spotify_%u_%Y-%m-%d_%H-%i-%s",
            slowdown_import: 100,
            slowdown_export: 100,

            development: false,
            printPlaylists: false,
            prettyPrint: 0, // Json pretty-printing spacing level
            excludeSaved: false,
            excludePlaylists: []
        };
    }

    async initialize() {
        const instance = this;
        if (this.isMicrosoftInternetExplorer()) {
            return; // Note: Error handling in index.html
        }

        if (!this.isServer()) {
            return;
        }

        const isLoaded = await this.loadConfiguration();
        if (!isLoaded) {
            return;
        }

        // Try automatically connect with last access token
        let authentificatedData = false;
        if (sessionStorage.getItem('accessToken')) {
            authentificatedData = await this.checkAuthentification(true);
            if (authentificatedData) {
                this.showMenu(authentificatedData);
            }
        }

        // If fail let the user connect by self
        if (!authentificatedData) {
            const loginBtn = document.getElementById('login');
            loginBtn.style.display = 'block';
            if (loginBtn) {
                loginBtn.addEventListener('click', (event) => {
                    instance.spotifyAuthorize(event);
                });
                window.addEventListener('message', (event) => {
                    instance.spotifyAuthorizeCallback(event);
                }, false);
            }
        }
    }

    logAppend(element) {
        const log = document.getElementById('log');
        if (log) {
            log.append(element);
        }
    }

    createAlertMessage(type, message) {
        const div = document.createElement('div');
        div.classList.add('alert', `alert-${type}`);
        div.innerHTML = message;
        return div;
    }

    isMicrosoftInternetExplorer() {
        return (navigator.userAgent.indexOf('MSIE') >= 0 || navigator.appVersion.indexOf('Trident/') >= 0);
    }

    // Check if someone opens it the file with 'file://'
    isServer() {
        if (location.protocol.startsWith('http')) {
            return true;
        }

        const pnlLoggedOut = document.getElementById('pnlLoggedOut');
        if (pnlLoggedOut) {
            const example = (title, code) => {return `<p><b>${title}:</b><br>${code}</p>`};
            pnlLoggedOut.innerHTML = '';
            // @todo Should be not in heading
            pnlLoggedOut.parentNode.append(
                this.createAlertMessage('danger',
                    '<b>Sorry, you must use a server!</b>' +
                    example('Python3 example', 'python3 -m http.server -b 127.0.0.1 8888') +
                    example('Python2 example', 'python -m SimpleHTTPServer -b 127.0.0.1 8888')
                )
            );
        }
        return false;
    }

    async loadConfiguration() {
        const instance = this;
        return await this.getJson(this.configurationFile).then(data => {
            data.prettyPrint = parseInt(data.prettyPrint, 10);
            instance.settings = {...this.settings, ...data}
            return true;
        }).catch(error => {
            const message = instance.createAlertMessage('warning','<b>Warning:</b> Configuration file not loaded!<br>' + error);
            const pnlLoggedOut = document.getElementById('pnlLoggedOut');
            if (pnlLoggedOut) {
                pnlLoggedOut.parentNode.insertBefore(message, pnlLoggedOut);
            } else {
                document.getElementById('body').parentNode.append(message);
            }
            return false;
        });
    }

    async getJson(url) {
        return fetch(url, {
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Accept': 'application/json'
            }
        }).then(response => {
            if (response.status === 200) {
                return response.json();
            } else {
                console.error('Response: ', response);
                return Promise.reject('Response error');
            }
        }).then(data => {
            return data;
        }).catch(error => {
            console.error('Error: ', error);
            return Promise.reject(error);
        });
    }

    async getApi(path) {
        return fetch('https://api.spotify.com/v1' + path, {
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('accessToken')
            }
        }).then(response => {
            if (response.status === 200) {
                return response.json();
            } else {
                console.error('Response: ', response);
                return Promise.reject('Response error');
            }
        }).then(data => {
            return data;
        }).catch(error => {
            console.error('Error: ', error);
            return Promise.reject(error);
        });
    }

    spotifyAuthorize() {
        const width = 480;
        const height = 640;
        const left = (screen.width / 2) - (width / 2);
        const top = (screen.height / 2) - (height / 2);

        const set = {
          client_id: this.settings.client_id,
          redirect_uri: this.settings.redirect_uri,
          scope: 'playlist-read playlist-read-private playlist-modify-public playlist-modify-private user-library-read user-library-modify',
          response_type: 'token',
          show_dialog: 'true'
        };
        this.authWindow = window.open(
            'https://accounts.spotify.com/authorize?' + urlEncodeSet(set),
            'Spotify',
            'menubar=no,location=no,resizable=no,scrollbars=no,status=no, width=' + width + ', height=' + height + ', top=' + top + ', left=' + left
        );
    }

    async spotifyAuthorizeCallback(event) {
        if (event.origin !== this.settings.uri) {
            console.error('"uri" missconfigured', {uri: this.settings.uri, origin: origin});
            return;
        }
        if (this.authWindow) {
            this.authWindow.close();
        }

        sessionStorage.setItem('accessToken', event.data);
        const authentificatedData = await this.checkAuthentification(false);
        if (authentificatedData) {
            this.showMenu(authentificatedData);
        }
    }

    checkAuthentification(automatic) {
        const instance = this;
        return this.getApi('/me').then(response => {
            return {
                userId: response.id.toLowerCase(),
                userName: response.display_name ?? response.id,
                images: response.images
            };
        }).catch(error => {
            if (!automatic) {
                instance.logAppend(instance.createAlertMessage('danger',
                    '<b>Error:</b> Authentification with Spotify failed! Reload page and try again!'
                ));
            }

            sessionStorage.removeItem('accessToken');
            console.error('Error: ', error);
            return null;
        });
    }

    showMenu(data) {
        document.getElementById('pnlLoggedOut').style.display = 'none';

        const userAvatar = (data.images[0]?.url ? '<img src="' + data.images[0]?.url + '" style="max-height: 32px; vertical-align: middle;"> ' : '');
        document.getElementById('userName').innerHTML = `${userAvatar}<span>${data.userName}</span>`;

        // @todo remove when finished
        userId = data.userId;
        conf = this.settings;

        refreshTrackData(() => {
            document.getElementById('pnlAction').style.display = 'block';
        });
        bindControls();
        refreshProgress();
    }
}

var conf = {};

var token = null;
var userId = '';
var collections = {};

var isImporting = false;
var isExporting = false;
var globalStep = "";
var playlistStep = 0;
var trackStep = 0;
var trackTotal = 0;

var playlistQueue = [];
var savedQueue = [];

var makingChanges = false;

let instance2 = this; // @todo Development, remove after finished
(function() {
    const app = new App();
    app.initialize();
    instance2 = app; // @todo Development, remove after finished
})();

function refreshTrackData(callback) {
    if (!isExporting && !isImporting) {
        isExporting = true;
        resetCounter();
        document.getElementById('pnlLoadingAccount').style.display = 'block';
        const loadingTitle = document.getElementById('loadingTitle');
        loadingTitle.innerHTML = 'Please wait. Loading your playlists and tracks ...';
        refreshPlaylist(() => {
            refreshMyMusicTracks(() => {
                // refreshStarredTracks(() => {
                    loadingTitle.innerHTML = 'Finished loading, you now might want to export or import.';
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
    } else {
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
        'Authorization': 'Bearer ' + sessionStorage.getItem('accessToken')
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
            'Authorization': 'Bearer ' + sessionStorage.getItem('accessToken')
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
    setTimeout(function() {
        console.log("Fast runners are dead runners");
        handlePlaylistRequests(arr, callback)
    }, conf.slowdown_import);
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
            'Authorization': 'Bearer ' + sessionStorage.getItem('accessToken')
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
        const d = new Date();
        let filename = conf.filename;
        filename = filename.replaceAll('%Y', d.getUTCFullYear());
        filename = filename.replaceAll('%m', d.getUTCMonth() + 1);
        filename = filename.replaceAll('%d', d.getUTCDate());
        filename = filename.replaceAll('%H', ((d.getHours() < 10) ? '0' : '') + d.getHours());
        filename = filename.replaceAll('%i', ((d.getMinutes() < 10) ? '0' : '') + d.getMinutes());
        filename = filename.replaceAll('%s', ((d.getSeconds() < 10) ? '0' : '') + d.getSeconds());
        filename = filename.replaceAll('%u', (userId && userId !== '' ? '_' + userId : ''));
        download(`${filename}.json`, JSON.stringify(collections, null, conf.prettyPrint));
    });
    $('#fileImport').change(readFile);
}

function refreshMyMusicTracks(callback) {
    collections.saved = [];
    playlistStep += 1;

    if (conf.excludeSaved) {
        callback();
    } else {
        loadTrackChunks('https://api.spotify.com/v1/me/tracks', collections.saved, callback);
    }
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
//             'Authorization': 'Bearer ' + sessionStorage.getItem('accessToken')
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
    setTimeout(function() {
        console.log("Taking breath, not to fast my cheetah");
        loadTrackChunks(url, arr, callback);
    }, conf.slowdown_export);
}

function loadTrackChunks(url, arr, callback) {
    $.ajax({
        url: url,
        headers: {
            'Authorization': 'Bearer ' + sessionStorage.getItem('accessToken')
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
        if (conf.printPlaylists) {
            let logData = [];
            playlists.forEach(playlist => {
                logData.push(`${playlist.name} (${playlist.id})`);
            });
            instance2.logAppend(instance2.createAlertMessage('info',
                '<b>Playlists:</b>' +
                '<ul><li>' + logData.join('</li><li>') + '</li></ul>'
            ));
        }

        playlistsFiltered = [];
        playlists.forEach(playlist => {
            if (!conf.excludePlaylists.includes(playlist.id)) {
                playlistsFiltered.push(playlist);
            }
        });
        playlists = playlistsFiltered;

        handlePlaylistTracks(playlists, collections.playlists, callback);
    });
}

function loadPlaylistChunks(url, arr, callback) {
    $.ajax({
        url: url,
        headers: {
            'Authorization': 'Bearer ' + sessionStorage.getItem('accessToken')
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
