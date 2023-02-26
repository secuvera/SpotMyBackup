# SpotMyBackup

Backup and Restore your Spotify Playlists and "My Music".

This javascript based app allows you to backup all your playlists and import them in any other Spotify Account. It uses the OAuth-Functionality of Spotify to be able to handle your personal playlists. 

In consequence, no credentials or data is stored or processed on the Webserver itself.

You can use it at www.spotmybackup.com or on your own webserver (see Q&A).

## Developers

* [Spotify: Web Api Reference](https://developer.spotify.com/documentation/web-api/reference/)

* [Spotify: Developer Dashboard](https://developer.spotify.com/dashboard/)
  * Create a application or edit application settings
  * Configure your redirect/callback uri (http://127.0.0.1:8888/login.html)

Start website with a server, for example:

```bash
# Python 3
python3 -m http.server -b 127.0.0.1 8888

# Python 2
python -m SimpleHTTPServer -b 127.0.0.1 8888
```

Check export with jq:

```bash
sudo apt install jq

jq '{file: input_filename, savedCount: .saved? | length, playlistCount: .playlists? | length, playlists: [.playlists?[] | {name: .name, tracks: .tracks | length}]}' ~/Downloads/spotify_*.json
```
