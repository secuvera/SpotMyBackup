// @todo Check if old backups have track ids or uris for fallback
class Log {
    constructor(container) {
        this.container = container;
    }

    createAlert(type, message) {
        const div = document.createElement('div');
        div.classList.add('alert', `alert-${type}`);
        div.innerHTML = message;
        this.container.appendChild(div);
        return div;
    }

    message(type, message) {
        switch(type) {
            case 'success': type = '✅ '; break;
            case 'error':   type = '❌ '; break;
            case 'warning': type = '⚠️ '; break;
            case 'info': type = 'ℹ️ '; break;
            default: type = '';
        }
        return `${type}${message}`;
    }

    createMessage(type, message) {
        const div = document.createElement('div');
        div.innerHTML = this.message(type, message);
        return div;
    }

    asciiSpinner(key, message) {
        const instance = this;

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

            return {
                container: div,
                spinner: div.children[0],
                message: (message) => {
                    div.children[1].innerHTML = message;
                },
                messageOnly: (type, message) => {
                    div.parentNode.replaceChild(
                        instance.createMessage(type, message), div
                    );
                }
            };
        }
        return null;
    }
}

class Download {
    async urls(urls) {
        const instance = this;
        if (!urls) {
            console.error('Urls to download missing!');
            return false;
        }
        if (typeof urls === 'string') {
            urls = [urls];
        }

        let result = null;
        await urls.forEach(async url => {
            const resultUrl = await instance.url(null, url);
            result = (result !== null ? result && resultUrl : false);
        });
        return (result !== null ? result : false);
    }

    // download.url('file.txt', 'https://example.org');
    async url(filename, url) {
        if (!filename || filename === '') {
            filename = url;
            filename = filename.replace(/^.*[\\\/]/, '');
            filename = filename.replace(/\?.*$/, '');
        }

        return fetch(url).then(result => {
            if (!result.ok) {
                throw Error(result.statusText);
            }
            return result.blob();
        }).then(file => {
            const tempUrl = URL.createObjectURL(file);
            const result = this.runDownloadLinkClick(filename, tempUrl);
            URL.revokeObjectURL(tempUrl);
            return result;
        }).catch(reason => {
            console.error('Error downloading: ' + reason);
            return false;
        });
    }

    // download.contentText('file.txt', 'content');
    contentText(filename, content) {
        if (!filename || filename === '') {
            filename = 'file.txt';
        }
        return this.runDownloadLinkClick(filename, 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    }

    runDownloadLinkClick(filename, url) {
        const element = document.createElement('a');
        element.setAttribute('href', url);
        element.setAttribute('download', filename);
        element.click();
        return true;
    }
}

const download = new Download();

class App {
    constructor() {
        this.configurationFile = 'config.json';
        this.authWindow = null;

        this.settings = {
            clientId: '', // Spotify client id
            uri: 'http://127.0.0.1:8888', // Callback uri for callback-*.html
            redirectUri: 'http://127.0.0.1:8888/callback-spotify.html', // Spotify's callback uri

            filename: 'spotify_%u_%Y-%m-%d_%H-%i-%s', // Exported filename
            prettyPrint: 0,         // Json pretty-printing spacing level
            extendedTrack: false,   // Extend track data
            slowdownExport: 100,    // Slowdown api calls for tracks in milliseconds
            slowdownImport: 100,    // Slowdown api calls for tracks in milliseconds
            market: '',             // Track Relinking for is_playable https://developer.spotify.com/documentation/web-api/concepts/track-relinking

            development: false,     // A switch for some switches
            devShortenSpotifyExportTracks: 0, // Shorten track data
            dryrun: false,          // Do not make any changes
            printPlaylists: false,  // Just print playlist on website
            excludeSaved: false,    // Exclude saved/my-music in export
            excludePlaylists: []    // Exclude playlist ids in export
        };

        this.export = null;
        this.state = {
            userId: '',
        };

        this.container = document.getElementById('container');
        this.log = new Log(this.container);
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
            if (loginBtn) {
                loginBtn.style.display = 'block';
                loginBtn.addEventListener('click', (event) => {
                    instance.spotifyAuthorize(event);
                });
                window.addEventListener('message', (event) => {
                    instance.spotifyAuthorizeCallback(event);
                }, false);
            }
        }
    }

    isMicrosoftInternetExplorer() {
        return (navigator.userAgent.indexOf('MSIE') >= 0 || navigator.appVersion.indexOf('Trident/') >= 0);
    }

    // Check if someone opens it the file with 'file://'
    isServer() {
        if (location.protocol.startsWith('http')) {
            return true;
        }

        const example = (title, code) => {return `<p><b>${title}:</b><br>${code}</p>`};
        this.container.innerHTML = '';

        this.log.createAlert('danger',
            '<b>Sorry, you must use a server!</b> For example:' +
            example('Python 3', 'python3 -m http.server -b 127.0.0.1 8888') +
            example('Python 2', 'python -m SimpleHTTPServer -b 127.0.0.1 8888')
        );
        return false;
    }

    async loadConfiguration() {
        const instance = this;
        return await this.getJson(this.configurationFile).then(data => {
            data.prettyPrint = parseInt(data.prettyPrint, 10);
            instance.settings = {...this.settings, ...data}
            return true;
        }).catch(error => {
            const message = instance.log.createAlert('danger', '<b>Warning:</b> Configuration file not loaded!<br>' + error);
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
        }).catch(error => {
            console.error('Error: ', error);
            return Promise.reject(error);
        });
    }

    async api(url, data, method) {
        const instance = this;

        if (url.startsWith('/')) {
            url = 'https://api.spotify.com/v1' + url;
        }

        if (this.settings.market !== '') {
            url = new URL(url);
            url.searchParams.append('market', this.settings.market);
            url = url.toString();
        }

        let options = {
            method: (method ?? 'GET'),
            cache: 'no-cache',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('accessToken')
            }
        };

        if (data) {
            if (options.method !== 'PUT') {
                options.method = 'POST';
            }
            options.headers['Content-type'] = 'application/json';
            options.body = JSON.stringify(data);
        }

        if (options.method === 'PUT') {
            delete options.headers.Accept;
        }

        return fetch(url, options).then(response => {
            if ([200, 201].includes(response.status)) {
                if (options.method === 'PUT') {
                    return true;
                } else {
                    return response.json();
                }
            } else {
                console.error('Response: ', response);
                return Promise.reject(response);
            }
        }).catch(async error => {
            let errorMessage = 'API failed.';
            if (error.statusText) {
                errorMessage += ` ${error.statusText}`
            }
            if (error.status) {
                errorMessage += ` (${error.status})`
            }
            try {
                const errorText = await error.text();
                const errorJson = JSON.parse(errorText);
                if (errorJson.error && errorJson.error.message) {
                    errorMessage += `<br>${errorJson.error.message}`
                    if (errorJson.error.status) {
                        errorMessage += ` (${errorJson.error.status})`
                    }
                }
            } catch(exeption) {}
            console.error('Error: ', error);
            instance.log.createAlert('danger', `<b>Error:</b> ${errorMessage}`);
            return Promise.reject(error);
        });
    }

    async getApi(url) {
        return await this.api(url, null, null);
    }

    async postApi(url, data) {
        return await this.api(url, data, null);
    }

    async putApi(url, data) {
        return await this.api(url, data, 'PUT');
    }

    spotifyAuthorize() {
        const width = 480;
        const height = 640;
        const left = (screen.width / 2) - (width / 2);
        const top = (screen.height / 2) - (height / 2);

        const queryParams = {
          client_id: this.settings.clientId,
          redirect_uri: this.settings.redirectUri,
          scope: 'playlist-read playlist-read-private playlist-modify-public playlist-modify-private user-library-read user-library-modify',
          response_type: 'token',
          show_dialog: 'true'
        };
        this.authWindow = window.open(
            'https://accounts.spotify.com/authorize?' + this.arrayToQueryParameter(queryParams),
            'Spotify',
            'menubar=no,location=no,resizable=no,scrollbars=no,status=no, width=' + width + ', height=' + height + ', top=' + top + ', left=' + left
        );
    }

    arrayToQueryParameter(data) {
        let list = [];
        for (let key in data) {
            if (data.hasOwnProperty(key)) {
                list.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
            }
        }
        return list.join('&');
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
                images: response.images,
                urlProfile: response.external_urls?.spotify,
            };
        }).catch(error => {
            if (!automatic) {
                instance.log.createAlert('danger',
                    '<b>Error:</b> Authentification with Spotify failed! Reload page and try again!'
                );
            }

            sessionStorage.removeItem('accessToken');
            console.error('Error: ', error);
            return null;
        });
    }

    async showMenu(data) {
        document.getElementById('pnlLoggedOut').remove();
        this.container.innerHTML = '';

        this.state.userId = data.userId;
        this.appendAvatar(data.userName, data.images[0]?.url, data.urlProfile);

        await this.spotifyExport();
        this.appendDownload();
        this.appendImport();
    }

    appendAvatar(username, image, url) {
        const userAvatar = (image ? '<img src="' + image + '" style="max-height: 32px; vertical-align: middle;"> ' : '');
        let content = `${userAvatar}<span>${username}</span>`;
        if (url && url !== '') {
            content = `<a href="${url}" target="_blank">${content}</a>`;
        }

        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        avatar.innerHTML = content;
        this.container.append(avatar);
    }

    appendDownload() {
        const instance = this;

        const button = document.createElement('button');
        button.id = 'btnDownload';
        button.classList.add('button');
        button.innerText = 'Download';
        this.container.append(button);

        button.addEventListener('click', () => {
            const d = new Date();
            const dMonth = d.getMonth() + 1;
            let filename = instance.settings.filename;
            filename = filename.replaceAll('%Y', d.getFullYear());
            filename = filename.replaceAll('%m', ((dMonth < 10) ? '0' : '') + dMonth);
            filename = filename.replaceAll('%d', ((d.getDate() < 10) ? '0' : '') + d.getDate());
            filename = filename.replaceAll('%H', ((d.getHours() < 10) ? '0' : '') + d.getHours());
            filename = filename.replaceAll('%i', ((d.getMinutes() < 10) ? '0' : '') + d.getMinutes());
            filename = filename.replaceAll('%s', ((d.getSeconds() < 10) ? '0' : '') + d.getSeconds());
            filename = filename.replaceAll('%u', instance.state.userId);
            download.contentText(`${filename}.json`,
                JSON.stringify(instance.export, null, instance.settings.prettyPrint)
            );
        });
    }

    appendImport() {
        const instance = this;

        const element = document.createElement('div');
        element.id = 'pnlImport';
        element.innerHTML = 
            `<label class="button bg-red" for="fileImport">Import a previously exported file</label>` +
            `<input type="file" id="fileImport" accept="application/json" />`;
        this.container.append(element);

        element.querySelector('input').addEventListener('change', (event) => {
            instance.spotifyImport(event);
        });
    }

    async spotifyExport() {
        this.export = {};
        this.progressLogExport = this.log.createAlert('info', '<b>Exporting Spotify</b>');

        let playlists = await this.spotifyExportPlaylists();
        this.printPlaylists('Playlists found', playlists);

        if (this.settings.excludePlaylists.length > 0) {
            playlists = this.filterPlaylists(playlists);
            this.printPlaylists('Playlists filtered', playlists);
        }

        playlists = await this.spotifyExportPlaylistsTracks(playlists);
        this.export.playlists = playlists;

        if (!this.settings.excludeSaved) {
            let saved = await this.spotifyExportSavedTracks();
            this.export.saved = saved;
        }
    }

    async spotifyExportPlaylists() {
        const spinner = this.log.asciiSpinner('time', `Loading playlists...`);
        this.progressLogExport.appendChild(spinner.container);
        let count = 0;

        let playlists = [];
        let url = '/users/' + this.state.userId + '/playlists'
        do {
            const response = await this.getApi(url);
            if (response.items) {
                response.items.forEach(playlist => {
                    if (playlist.tracks && playlist.tracks.href) {
                        playlists.push({
                            name: playlist.name,
                            description: playlist.description,
                            public: playlist.public,
                            collaborative: playlist.collaborative,
                            href: playlist.tracks.href,
                            id: playlist.id,
                            tracks: []
                        });
                        count++;
                    }
                });
            }
            url = response.next ?? null;
            spinner.message(`Loading playlists... ${count}`);
        } while(url);

        spinner.messageOnly('success', `${count} Playlists found`);
        return playlists;
    }

    printPlaylists(title, playlists) {
        if (this.settings.printPlaylists) {
            let data = [];
            playlists.forEach(playlist => {
                data.push(`${playlist.name} (${playlist.id})`);
            });
            this.log.createAlert('info', `<b>${title}:</b><ul><li>` + data.join('</li><li>') + '</li></ul>');
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

        this.progressLogExport.appendChild(
            this.log.createMessage('success', `${filtered.length} Playlists filtered for export`)
        );
        return filtered;
    }

    async spotifyExportPlaylistsTracks(playlists) {
        for (let i = 0; i < playlists.length; i++) {
            const spinner = this.log.asciiSpinner('time', `Loading ${playlists[i].name} tracks...`);
            this.progressLogExport.appendChild(spinner.container);

            playlists[i].tracks = await this.spotifyExportTracks(playlists[i].href);
            delete playlists[i].href;

            spinner.messageOnly('success', `<span class="count-track">${playlists[i].tracks.length}</span> Tracks: ${playlists[i].name}`);
        }
        return playlists;
    }

    async spotifyExportSavedTracks() {
        const spinner = this.log.asciiSpinner('time', `Loading saved tracks...`);
        this.progressLogExport.appendChild(spinner.container);

        const tracks = await this.spotifyExportTracks('/me/tracks');

        spinner.messageOnly('success', `<span class="count-track">${tracks.length}</span> Tracks: Saved`);
        return tracks;
    }

    async spotifyExportTracks(url) {
        const instance = this;

        const spinner = this.log.asciiSpinner('time', `Loading tracks for current list...`);
        this.progressLogExport.appendChild(spinner.container);

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

                        if (track.track.hasOwnProperty('is_playable')) {
                            trackData.is_playable = track.track.is_playable;
                        }

                        tracks.push(trackData);
                        count++;
                    } else {
                        console.log('Track is null', url, track);
                        instance.log.createAlert('warning', '<b>Warning:</b> Track is null! See console log.');
                    }
                });
            }
            url = response.next ?? null;
            spinner.message(`Loading tracks for current list... ${count}`)

            // On development you might not want to loading all tracks, because this could be huge!
            if (this.settings.development && this.settings.devShortenSpotifyExportTracks <= ++devCount) {
                break;
            }

            // @todo Better know the api limit
            await new Promise(resolve => {
                console.log(`Slowdown exporting tracks by ${instance.settings.slowdownExport} ms`);
                setTimeout(resolve, instance.settings.slowdownExport);
            });
        } while(url);

        spinner.container.remove();
        return tracks;
    }

    async spotifyImport(event) {
        // @todo We could support importing multiple files at once, but should we?!
        if (event.target.files.length > 1) {
            this.log.createAlert('warning', '<b>Warning:</b> Importing multiple files is not supported!');
            return;
        }

        if (event.target.files.length === 1) {
            // Hide download and import button, because data has changed
            document.getElementById('btnDownload').remove();
            document.getElementById('pnlImport').remove();

            const data = await this.readFileAsync(event.target.files[0]);

            this.progressLogImport = this.log.createAlert('info', '<b>Importing to Spotify</b>');

            this.progressLogImport.appendChild(
                this.log.createMessage('info', `Filename: ${event.target.files[0].name}`)
            );

            if (this.settings.dryrun) {
                this.progressLogImport.appendChild(
                    this.log.createMessage('info', `Dry run: Nothing will be stored`)
                );
            }

            // @todo Check starred import
            if (data.starred) {
                data.playlists.push({
                    name: 'Deprecated "starred" playlist',
                    tracks: data.starred
                });

                this.progressLogImport.appendChild(
                    this.log.createMessage('warning', `Starred is deprecated and will be imported as a playlist!`)
                );
            }

            if (data.playlists) {
                await this.spotifyImportPlaylists(data.playlists);
            }

            if (data.saved) {
                await this.spotifyImportSaved(data.saved);
            }
        }
    }

    readFileAsync(file) {
        return new Promise((resolve, reject) => {
            if (!file || file.type !== 'application/json') {
                this.log.createAlert('danger', '<b>Error:</b> File is not supported!');
                reject();
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const json = event.target.result;
                const data = JSON.parse(json);
                resolve(data);
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    async spotifyImportPlaylists(playlists) {
        const instance = this;
        const spinner = this.log.asciiSpinner('time', `Importing playlists...`);
        this.progressLogImport.appendChild(spinner.container);
        let count = 0;

        for (let i = 0; i < playlists.length; i++)  {
            let foundPlaylist = null;
            instance.export.playlists.forEach(exportedPlaylist => {
                if (playlists[i].id === exportedPlaylist.id) {
                    foundPlaylist = exportedPlaylist;
                    return;
                }
            });

            // @todo I don't know if guess by name is a good idea
            if (!foundPlaylist) {
                instance.export.playlists.forEach(exportedPlaylist => {
                    if (playlists[i].name === exportedPlaylist.name) {
                        foundPlaylist = exportedPlaylist;
                        return;
                    }
                });
            }

            if (!foundPlaylist) {
                const newPlaylist = await this.createPlaylist(playlists[i]);
                if (newPlaylist) {
                    foundPlaylist = newPlaylist;
                }
            }

            if (!foundPlaylist && !this.settings.dryrun) {
                this.progressLogImport.appendChild(
                    this.log.createMessage('error', `Playlists not found or created in Spotify: ${playlists[i].name}`)
                );
            }

            if (foundPlaylist) {
                const tracksToImport = this.comparePlaylistTracks(playlists[i], foundPlaylist);
                await this.spotifyImportTracks(foundPlaylist, tracksToImport);
            }

            count++;
            spinner.message(`Importing playlists... ${count}`);
        }

        spinner.messageOnly('success', `${count} Playlists imported`)
    }

    async createPlaylist(playlist) {
        const collaborative = (playlist.collaborative ? true : false);
        const data = {
            name: playlist.name,
            description: (playlist.description ?? ''),
            public: (playlist.public ? !collaborative : false),
            collaborative: collaborative
        };

        if (!this.settings.dryrun) {
            const response = await this.postApi('/users/' + this.state.userId + '/playlists', data);
            if (response && response.id !== '') {
                this.progressLogImport.appendChild(
                    this.log.createMessage('success', `Playlists created: ${playlist.name}`)
                );

                return response;
            } else {
                this.progressLogImport.appendChild(
                    this.log.createMessage('error', `Playlists not created: ${playlist.name}`)
                );
            }
        } else {
            this.progressLogImport.appendChild(
                this.log.createMessage('info', `Playlists created: ${playlist.name}`)
            );
        }
        return null;
    }

    // Note: Saved import want ids instead of uris
    comparePlaylistTracks(importedPlaylist, storedPlaylist, onlyIds) {
        let tracks = [];
        importedPlaylist.tracks.forEach(importedTrack => {
            let found = false;
            if (storedPlaylist.tracks && storedPlaylist.tracks.length > 0) {
                storedPlaylist.tracks.forEach(storedTrack => {
                    if (!onlyIds && importedTrack.uri === storedTrack.uri) {
                        found = true;
                        return;
                    } else if (onlyIds && importedTrack.id === storedTrack.id) {
                        found = true;
                        return;
                    }
                });
            }

            // Select only only missing tracks for import
            if (!found) {
                tracks.push(!onlyIds ? importedTrack.uri : importedTrack.id);
            }
        });
        return tracks;
    }

    async spotifyImportTracks(playlist, tracks) {
        const instance = this;
        tracks = tracks.reverse();
        let count = 0;
        const chunkSize = 100;
        for (let i = 0; i < tracks.length; i += chunkSize) {
            const chunkTracks = tracks.slice(i, i + chunkSize);

            if (!this.settings.dryrun) {
                const response = await this.postApi('/playlists/' + playlist.id + '/tracks', {
                    uris: chunkTracks.reverse(),
                    position: 0
                });

                if (response && response.id !== '') {
                    count += chunkTracks.length;
                } else {
                    console.error('Playlists not fully imported', playlist, chunkTracks);
                    this.progressLogImport.appendChild(
                        this.log.createMessage('error', `Playlists not fully imported! See console error.`)
                    );
                }

                // @todo Better know the api limit
                await new Promise(resolve => {
                    console.log(`Slowdown importing tracks by ${instance.settings.slowdownImport} ms`);
                    setTimeout(resolve, instance.settings.slowdownImport);
                });
            } else {
                count += chunkTracks.length;
            }
        }

        const type = (!this.settings.dryrun ? 'success' : 'info');
        this.progressLogImport.appendChild(
            this.log.createMessage(type, `${count} / ${tracks.length} tracks: ${playlist.name}`)
        );
    }

    async spotifyImportSaved(saved) {
        const instance = this;
        const spinner = this.log.asciiSpinner('time', `Importing saved...`);
        this.progressLogImport.appendChild(spinner.container);

        const tracksToImport = this.comparePlaylistTracks({tracks: saved}, {tracks: instance.export.saved}, true);
        await this.spotifyImportSavedTracks(tracksToImport);

        spinner.messageOnly('success', `Saved imported`);
    }

    async spotifyImportSavedTracks(tracks) {
        const instance = this;
        tracks = tracks.reverse();
        let count = 0;
        const chunkSize = 50;
        for (let i = 0; i < tracks.length; i += chunkSize) {
            const chunkTracks = tracks.slice(i, i + chunkSize);

            if (!this.settings.dryrun) {
                const response = await this.putApi('/me/tracks', {
                    ids: chunkTracks.reverse()
                });

                if (response) {
                    count += chunkTracks.length;
                } else {
                    console.error('Saved not fully imported', tracks, chunkTracks);
                    this.progressLogImport.appendChild(
                        this.log.createMessage('error', `Saved not fully imported! See console error.`)
                    );
                }

                // @todo Better know the api limit
                await new Promise(resolve => {
                    console.log(`Slowdown importing tracks by ${instance.settings.slowdownImport} ms`);
                    setTimeout(resolve, instance.settings.slowdownImport);
                });
            } else {
                count += chunkTracks.length;
            }
        }

        const type = (!this.settings.dryrun ? 'success' : 'info');
        this.progressLogImport.appendChild(
            this.log.createMessage(type, `${count} / ${tracks.length} Tracks: Saved`)
        );
    }
}

(function() {
    const app = new App();
    app.initialize();
})();


