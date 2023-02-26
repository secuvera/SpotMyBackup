// @todo add this to stop interval: this.refreshProgressStop();
// @todo if jquery loaded, {login, callback}.html need it too
class App {
    constructor() {
        this.configurationFile = 'config.json';
        this.authWindow = null;
        this.refreshProgressInterval = null;
        this.refreshProgressInfo = null;

        this.settings = {
            uri: "http://localhost:8888",
            redirect_uri: "http://localhost:8888/login.html",
            client_id: "",

            filename: "spotify_%u_%Y-%m-%d_%H-%i-%s",
            extendedTrack: false, // Extend track data
            slowdown_import: 100,
            slowdown_export: 100,

            development: false,
            printPlaylists: false,
            prettyPrint: 0, // Json pretty-printing spacing level
            devShortenSpotifyExportTracks: 0, // Shorten track data
            excludeSaved: false,
            excludePlaylists: []
        };

        this.export = null;
        this.state = {
            running: false // Is a currently a process running?
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
                    '<b>Sorry, you must use a server!</b> For example:' +
                    example('Python 3', 'python3 -m http.server -b 127.0.0.1 8888') +
                    example('Python 2', 'python -m SimpleHTTPServer -b 127.0.0.1 8888')
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

    async getApi(url) {
        const instance = this;
        if (url.startsWith('/')) {
            url = 'https://api.spotify.com/v1' + url;
        }
        return fetch(url, {
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
                return Promise.reject(response);
            }
        }).then(data => {
            return data;
        }).catch(error => {
            console.error('Error: ', error);
            instance.logAppend(instance.createAlertMessage('danger',
                '<b>Error:</b> ' + error.statusText + ` (${error.status})`
            ));
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

    async checkAuthentification(automatic) {
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

        this.bindControls();
        this.spotifyExport();
    }

    bindControls() {
        const instance = this;

        document.getElementById('btnDownload').addEventListener('click', () => {
            const d = new Date();
            const dMonth = d.getMonth() + 1;
            let filename = instance.settings.filename;
            filename = filename.replaceAll('%Y', d.getFullYear());
            filename = filename.replaceAll('%m', ((dMonth < 10) ? '0' : '') + dMonth);
            filename = filename.replaceAll('%d', ((d.getDate() < 10) ? '0' : '') + d.getDate());
            filename = filename.replaceAll('%H', ((d.getHours() < 10) ? '0' : '') + d.getHours());
            filename = filename.replaceAll('%i', ((d.getMinutes() < 10) ? '0' : '') + d.getMinutes());
            filename = filename.replaceAll('%s', ((d.getSeconds() < 10) ? '0' : '') + d.getSeconds());
            filename = filename.replaceAll('%u', (userId && userId !== '' ? userId : ''));
            instance.download(`${filename}.json`, JSON.stringify(instance.export, null, instance.settings.prettyPrint));
        });

        document.getElementById('btnImport').addEventListener('click', () => {
            document.getElementById('pnlAction').style.display = 'none';
            document.getElementById('pnlImport').style.display = 'block';
        });

        document.getElementById('fileImport').addEventListener('change', () => {
            readFile();
        });
    }

    download(filename, content) {
        const pom = document.createElement('a');
        pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
        pom.setAttribute('download', filename);

        if (document.createEvent) {
            const event = document.createEvent('MouseEvents');
            event.initEvent('click', true, true);
            pom.dispatchEvent(event);
        } else {
            pom.click();
        }
    }

    asciiSpinner(key, message) {
        // https://raw.githubusercontent.com/sindresorhus/cli-spinners/master/spinners.json
        const spinners = {
            dots: {
                interval: 80,
                frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
            },
            time: {
                interval: 100,
                frames: ["🕐 ", "🕑 ", "🕒 ", "🕓 ", "🕔 ", "🕕 ", "🕖 ", "🕗 ", "🕘 ", "🕙 ", "🕚 ", "🕛 "]
            }
        };

        const spinner = spinners[key];
        if (spinner) {
            const div = document.createElement('div');

            const el = document.createElement('span');
            el.style.display = 'inline-block';
            el.style.width = '1.3em';
            div.appendChild(el);

            const span = document.createElement('span');
            span.innerHTML = `${message}`;
            div.appendChild(span);

            ((spinner, el) => {
                let i = 0;
                setInterval(() => {
                    el.innerHTML = spinner.frames[i];
                    i = (i + 1) % spinner.frames.length;
                }, spinner.interval);
            })(spinner, el);

            return div;
        }
        return null;
    }

    refreshProgressStart() {
        if (!this.refreshProgressInterval) {
            this.refreshProgressInterval = setInterval(this.refreshProgress, 1000);

            if (this.settings.development) {
                this.refreshProgressInfo = this.createAlertMessage('info', '');
                // this.refreshProgressInfo.appendChild(this.asciiSpinner('dots', 'Running...'));
                this.refreshProgressInfo.appendChild(this.asciiSpinner('time', 'Running...'));
                this.logAppend(this.refreshProgressInfo);
            }
        }
    }

    refreshProgressStop() {
        if (!this.refreshProgressInterval) {
            clearInterval(this.refreshProgressInterval);
        }
        if (this.settings.development && this.refreshProgressInfo) {
            this.refreshProgressInfo.remove();
        }
    }

    refreshProgress() {
        document.getElementById('globalStep').innerText = globalStep;
        document.getElementById('playlistStep').innerText = playlistStep;
        document.getElementById('playlistTotal').innerText = playlistTotal;
        document.getElementById('trackStep').innerText = trackStep;
        document.getElementById('trackTotal').innerText = trackTotal;

        let progress = 0;
        if (trackTotal > 0) {
            progress = Math.floor(((trackStep / trackTotal) * 100));
        }
        document.getElementById('progressBar').style.width = progress + '%';

        if (typeof collections !== 'undefined' && !makingChanges) {
            const set = collectionProperties(collections);
            document.getElementById('loadingPlaylists').innerText = `${set.playlistCount} playlists`;
            document.getElementById('loadingTracks').innerText = `${set.trackCount} tracks`;
        }

        if (typeof importColl !== 'undefined') {
            const set2 = collectionProperties(importColl);
            document.getElementById('filePlaylists').innerText = `${set2.playlistCount} playlists`;
            document.getElementById('fileTracks').innerText = `${set2.trackCount} tracks`;
        }
    }

    async spotifyExport() {
        if (this.state.running) {
            this.logAppend(this.createAlertMessage('warning',
                '<b>Warning:</b> A process is curently running!'
            ));
            return;
        }

        this.state.running = true;
        this.export = {};
        isExporting = true; // @todo can be later removed
        this.refreshProgressStart();
        resetCounter();

        document.getElementById('pnlLoadingAccount').style.display = 'block';

        const loadingTitle = document.getElementById('loadingTitle');
        loadingTitle.innerHTML = 'Please wait. Loading your playlists and tracks ...';

        // @todo temporary progress log
        this.progressLog = this.createAlertMessage('info', '<b>Exporting Spotify</b>');
        this.logAppend(this.progressLog);

        let playlists = await this.spotifyExportPlaylists();
        this.printPlaylists('Playlists found', playlists);
        playlists = this.filterPlaylists(playlists);
        this.printPlaylists('Playlists filtered', playlists);
        playlists = await this.spotifyExportPlaylistsTracks(playlists);
        this.export.playlists = playlists;

        if (!conf.excludeSaved) {
            let saved = await this.spotifyExportSavedTracks();
            this.export.saved = saved;
        }

        // @todo old finished
        loadingTitle.innerHTML = 'Finished loading, you now might want to export or import.';
        isExporting = false;
        document.getElementById('pnlAction').style.display = 'block';

        // this.progressLog.remove();
        this.refreshProgressStop();
        this.state.running = false;
    }

    async spotifyExportPlaylists() {
        const spinner = this.asciiSpinner('time', `Loading playlists...`);
        this.progressLog.appendChild(spinner);
        let count = 0;

        let playlists = [];
        let url = '/users/' + userId + '/playlists'
        do {
            const response = await this.getApi(url);
            if (response.items) {
                response.items.forEach(playlist => {
                    if (playlist.tracks && playlist.tracks.href) {
                        playlists.push({
                            name: playlist.name,
                            href: playlist.tracks.href,
                            id: playlist.id,
                            tracks: []
                        });
                        count++;
                    }
                });
            }
            url = response.next ?? null;
            spinner.children[1].innerHTML = `Loading playlists... ${count}`;
        } while(url);

        spinner.children[1].innerHTML = `✅ ${count} Playlists found`;
        spinner.children[0].remove();
        return playlists;
    }

    printPlaylists(title, playlists) {
        if (this.settings.printPlaylists) {
            let data = [];
            playlists.forEach(playlist => {
                data.push(`${playlist.name} (${playlist.id})`);
            });
            this.logAppend(this.createAlertMessage('info',
                `<b>${title}:</b><ul><li>` + data.join('</li><li>') + '</li></ul>'
            ));
        }
    }

    filterPlaylists(playlists) {
        const instance = this;
        let filtered = [];
        playlists.forEach(playlist => {
            if (!instance.settings.excludePlaylists.includes(playlist.id)) {
                filtered.push(playlist);
            }
        });

        // @todo I am lazy, reconstruct log later
        const spinner = this.asciiSpinner('time', `✅ ${filtered.length} Playlists filterd for export`);
        spinner.children[0].remove();
        this.progressLog.appendChild(spinner);

        return filtered;
    }

    async spotifyExportPlaylistsTracks(playlists) {
        for (let i = 0; i < playlists.length; i++) {
            const spinner = this.asciiSpinner('time', `Loading ${playlists[i].name} tracks...`);
            this.progressLog.appendChild(spinner);

            playlists[i].tracks = await this.spotifyExportTracks(playlists[i].href);
            // delete playlists[i].href; // @todo should playlist url be removed?

            spinner.children[1].innerHTML = `✅ ${playlists[i].tracks.length} Tracks found in ${playlists[i].name}`;
            spinner.children[0].remove();
        }
        return playlists;
    }

    async spotifyExportSavedTracks() {
        const spinner = this.asciiSpinner('time', `Loading saved tracks...`);
        this.progressLog.appendChild(spinner);

        const tracks = await this.spotifyExportTracks('/me/tracks');

        spinner.children[1].innerHTML = `✅ ${tracks.length} Tracks found in saved`;
        spinner.children[0].remove();
        return tracks;
    }

    async spotifyExportTracks(url) {
        const instance = this;

        const spinner = this.asciiSpinner('time', `Loading tracks for current list...`);
        this.progressLog.appendChild(spinner);

        let count = 0;
        let devCount = 0;

        let tracks = [];
        do {
            const response = await this.getApi(url);
            if (!response) {
                return;
            }
            if (response.items) {
                response.items.forEach(track => {
                    if (track.track) {
                        let trackData = {
                            id: track.track.id,
                            uri: track.track.uri
                        };

                        if (instance.settings.extendedTrack) {
                            trackData.name = track.track.name;
                            trackData.album = track.track.album?.name;
                            if (track.track.artists) {
                                trackData.artists = [];
                                track.track.artists.forEach(artist => {
                                    trackData.artists.push(artist.name);
                                });
                            }
                        }

                        tracks.push(trackData);
                        count++;
                    } else {
                        console.log('Track is null', url, track);
                        instance.logAppend(instance.createAlertMessage('warning',
                            '<b>Warning:</b> Track is null! See console log.'
                        ));
                    }
                });
            }
            url = response.next ?? null;
            spinner.children[1].innerHTML = `Loading tracks for current list... ${count}`;

            // On development you might not want to loading all tracks, because this could be huge!
            if (this.settings.development && this.settings.devShortenSpotifyExportTracks <= ++devCount) {
                break;
            }

            // @todo Better know the api limit
            await new Promise(resolve => {
                console.log(`Slow down exporting tracks by ${instance.settings.slowdown_export} ms`);
                setTimeout(resolve, instance.settings.slowdown_export);
            });
        } while(url);

        spinner.remove();
        return tracks;
    }
}

var conf = {};

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

function resetCounter() {
    globalStep = '';
    playlistStep = 0;
    playlistTotal = 0;
    trackStep = 0;
    trackTotal = 0;
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


