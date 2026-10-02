// Glotz3r as a single executable: serves the embedded web/ folder locally and opens the page
// in the default browser. (YouTube embedding needs http, hence no file://.)
// Manifest, service worker and icon make the page installable as an app (PWA); once installed,
// it starts from the browser cache even without this server.
package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
)

// The page and everything it needs (service worker, manifest, icons). The same folder can be
// served by any other web server instead.
//
//go:embed web
var web embed.FS

func main() {
	// Fixed port: the browser stores login and sessions per address.
	defPort := 8097
	if p, err := strconv.Atoi(os.Getenv("PORT")); err == nil { // e.g. assigned by the preview
		defPort = p
	}
	port := flag.Int("port", defPort, "local port")
	jellyfin := flag.String("jellyfin", os.Getenv("JELLYFIN_URL"), "preset the Jellyfin address (otherwise enter it in the browser)")
	noBrowser := flag.Bool("no-browser", false, "do not open the browser automatically")
	flag.Parse()

	// Windows may map these extensions to other types in the registry; the service worker needs a JavaScript type.
	mime.AddExtensionType(".js", "text/javascript; charset=utf-8")
	mime.AddExtensionType(".webmanifest", "application/manifest+json")
	files, _ := fs.Sub(web, "web")
	http.Handle("/", http.FileServer(http.FS(files)))
	http.HandleFunc("/config.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]string{"jellyfin": *jellyfin})
	})

	url := fmt.Sprintf("http://127.0.0.1:%d/", *port)
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port)) // reachable locally only
	if err != nil {
		// Usually Glotz3r is already running there – then just open the existing one.
		fmt.Printf("Port %d is in use (%v). Opening %s\n", *port, err, url)
		if !*noBrowser {
			openBrowser(url)
		}
		os.Exit(1)
	}
	fmt.Printf("Glotz3r is running at %s\nClosing this window (or Ctrl+C) stops it.\n", url)
	if !*noBrowser {
		openBrowser(url)
	}
	if err := http.Serve(ln, nil); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		fmt.Println("Could not open the browser:", err)
	}
}
