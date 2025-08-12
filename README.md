# Chocolate-doom

Chocolate Doom is a source port of the game Doom, by id Software.  Doom was originally released in 1993.  Being a source port means that the original Doom source code was modified by fans to operate on current operating systems. The original chocolate-doom code base can be found at <a href='https://github.com/chocolate-doom/chocolate-doom'>chocolate-doom</a>.

## What was used in swDOOM

The Chocolate Doom codebase includes multiple version of Doom, the original, hexen, heretic, and strife.  With all the different versions the size of the codebase is about 10.5 MB.  However, for this project we wanted only the source code for doom.  That meant we could remove the source code for heretic, hexen, and strife.
| Name | Size | File Path |
| --- | --- | --- |
| Heretic  | 1.6 MB | `chocolate-doom/src/heretic` |
| Hexen   | 2.5 MB | `chocolate-doom/src/hexen` |
| Strife     | 2 MB   | `chocolate-doom/src/strife` |
With a little bit of editing to the `CMakeList.txt` files we were able to only compile the doom source.  This meant we essentially cut the size of the entire codebase in more than half, by 6.1 MB.  By doing so we gained a substantial understanding of the code and what was necessary or not.

## Build

### Linux

#### Dependencies
```
apt-get install gcc make libsdl2-dev libsdl2-net-dev \
    libsdl2-mixer-dev python-imaging
```

Navigate to chocolate-doom file, and within run:

```
./autogen.sh
make
make install
```

### WebAssembly using Emscripten

#### Dependencies
Emscripten - follow the instructions at the <a href='https://emscripten.org/docs/getting_started/downloads.html'>installation page</a>.

Navigate to chocolate-doom file, within run:
```
emcmake cmake
emmake make
```
