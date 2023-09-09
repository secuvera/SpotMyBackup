# SpotMyBackup

Backup and Restore your Spotify Playlists and "My Music".

This javascript based app allows you to backup all your playlists and import them in any other Spotify Account. It uses the OAuth-Functionality of Spotify to be able to handle your personal playlists. 

In consequence, no credentials or data is stored or processed on the Webserver itself.

You can use it at [www.spotmybackup.com](http://www.spotmybackup.com) or on your own webserver (see Q&A).

## Own hosted

Configure `uri` in `config.json` to your host/ip/domain and port, if is different.
For example: `http://127.0.0.1:8888`

Create or edit a Spotify application:

* [Spotify: Developer Dashboard](https://developer.spotify.com/dashboard/)
* Edit settings
  * Configure your redirect/callback uri for example to: `http://127.0.0.1:8888/callback-spotify.html`
  * (Saved it)
* Copy your Cliend ID and store it in `config.json` file under `clientId`.

Run a webserver, for example:

* [XAMPP](https://www.apachefriends.org/)
* [Docker: Nginx](https://hub.docker.com/_/nginx)

```bash
# Python 3
python3 -m http.server -b 127.0.0.1 8888

# Python 2
python -m SimpleHTTPServer -b 127.0.0.1 8888

# Docker non detached
docker run --rm -v ${PWD}:/usr/share/nginx/html:ro -p '127.0.0.1:8888:80' --name spotify-nginx nginx
```

... and open your configured url [127.0.0.1:8888](http://127.0.0.1:8888) in a web browser.

If you run into a CORS error message:

* You should use your ip instead of localhost
* You should add SSL (https)
* [CORS request did not succeed](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSDidNotSucceed)

## Configuration

The `config.json` file is for overwriting existing default configuration.
So it is not necessary to write everything down.

*Note: Default JSON did not have comments. It is just easier to explain.*

The minimal configuration, is mostly your uri and clientId:

```json
{
  // Required, your Spotify application client id
  "clientId": "[YOUR_TOKEN_HERE]",

  // Find the right window in callback-*.html
  "uri": "http://127.0.0.1:8888",

  // Spotify's callback uri
  "redirectUri": "http://127.0.0.1:8888/callback-spotify.html"
}
```

Extended configuration, mostly because you want it pretty:

```json
{
  // Change exported: {filename}.json
  // %u = username
  // %Y-%m-%d = Year-month-day = 2013-02-30
  // %H-%i-%s = Hour-minutes-seconds = 14-59-01
  "filename": "spotify_%u_%Y-%m-%d_%H-%i-%s",

  "prettyPrint": 0,         // Json pretty-printing spacing level
  "extendedTrack": false,   // More data, like track name, artist names, album name
  "slowdownExport": 100,    // Slow down api calls for tracks in milliseconds
  "slowdownImport": 100,    // Slow down api calls for tracks in milliseconds
  "market": "US"            // Track Relinking for is_playable https://developer.spotify.com/documentation/web-api/concepts/track-relinking
}
```

## Developers

* [Spotify: Web Api Reference](https://developer.spotify.com/documentation/web-api/reference/)

Developer configuration for `config.json`, you should know what you doing:

```json
{
  "development": false,     // A switch for some switches

  // You might not want to loading all tracks, because this could be huge!
  "devShortenSpotifyExportTracks": 0,

  "dryrun": true,           // Do not make any changes
  "printPlaylists": false,  // Just print playlist on website
  "excludeSaved": false,    // Exclude saved/my-music in export
  "excludePlaylists": []    // Exclude playlist ids in export
}
```

Check export with jq:

```bash
sudo apt install jq

jq '{file: input_filename, savedCount: .saved? | length, playlistCount: .playlists? | length, playlists: [.playlists?[] | {name: .name, tracks: .tracks | length}]}' ~/Downloads/spotify_*.json
```

## Filter not playable tracks

Since availability is not always guaranteed in Spotify, I would like to see which songs can no longer be played.

First you need to add `market` in your `config.json` file:

```json
{
  "market": "US" // Track Relinking for is_playable https://developer.spotify.com/documentation/web-api/concepts/track-relinking
}
```

Then create a new spotify backup. You will see a `is_playable` key in your track data.

Download and install [JQ](https://jqlang.github.io/jq/).

Execute this command:

```bash
jq '{
    playlists: [.playlists[] | {
        name: .name,
        notPlayable: ([.tracks[] | select(.is_playable == false)] | length),
        total: ([.tracks[]] | length),
        tracks: ([.tracks[] | select(.is_playable == false) | {name: .name, artists: .artists}])
    }],
    saved: {
        notPlayable: ([.saved[] | select(.is_playable == false)] | length),
        total: ([.saved[]] | length),
        tracks: ([.saved[] | select(.is_playable == false) | {name: .name, artists: .artists}])
    }
}' backup.json > not-playable.json
```

If you want full track data, remove both " | {name: .name, artists: .artists}".

***Note: You can not import the "not-playable.json" file as a recovery!***

Example Output:

```json
{
  "playlists": [
    {
      "name": "Games",
      "notPlayable": 1,
      "total": 24,
      "tracks": [
        {
          "name": "Exile Vilify (From the Game Portal 2)",
          "artists": [
            "The National"
          ]
        }
      ]
    },
  ],
  "saved": {...}
}
```
