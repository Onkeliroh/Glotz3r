// Glotz3r as a single executable: serves the embedded index.html locally and opens it
// in the default browser. (YouTube embedding needs http, hence no file://.)
// Manifest, service worker and icon make the page installable as an app (PWA); once installed,
// it starts from the browser cache even without this server.
package main

import (
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
)

//go:embed index.html
var index []byte

//go:embed sw.js
var sw []byte

//go:embed manifest.webmanifest
var manifest []byte

// App icon: two offset picture areas (movie white, reaction orange) on a dark background.
// Drawn at runtime so no binary file has to live in the project.
func icon(w http.ResponseWriter, r *http.Request) {
	s, _ := strconv.Atoi(r.URL.Query().Get("s"))
	if s < 16 || s > 1024 {
		s = 512
	}
	img := image.NewRGBA(image.Rect(0, 0, s, s))
	fill := func(x0, y0, x1, y1 int, c color.RGBA) { // values in percent of the edge length
		draw.Draw(img, image.Rect(x0*s/100, y0*s/100, x1*s/100, y1*s/100), &image.Uniform{c}, image.Point{}, draw.Src)
	}
	fill(0, 0, 100, 100, color.RGBA{0x0e, 0x0f, 0x13, 0xff})
	fill(18, 24, 68, 56, color.RGBA{0xe8, 0xea, 0xf0, 0xff})
	fill(34, 44, 82, 76, color.RGBA{0xff, 0xb2, 0x24, 0xff})
	w.Header().Set("Content-Type", "image/png")
	png.Encode(w, img)
}

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

	http.HandleFunc("/{$}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(index)
	})
	http.HandleFunc("/sw.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(sw)
	})
	http.HandleFunc("/manifest.webmanifest", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/manifest+json")
		w.Write(manifest)
	})
	http.HandleFunc("/icon.png", icon)
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
