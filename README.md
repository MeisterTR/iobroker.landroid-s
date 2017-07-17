![Logo](admin/landroid-s.png)
# ioBroker.landrois-s
=============
**Tests:** Linux/Mac: [![Travis-CI](https://api.travis-ci.org/MeisterTR/iobroker.landroid-s.svg?branch=master)](https://travis-ci.org/MeisterTR/iobroker.landroid-s)


Dieser Adapter verbindet Iobroker mit deinem Landroid S Modell 2017
Es werden Temperaturen, Mähzeiten, Akkustand und diverse weitere Daten ausgelesen
Ebenso kann er durch den Adapter gesteuert werden und die Konfiguration geändert werden.

## Installation

### Wechsel von 0.1.X auf 0.2.X
Bitte adapter vor Update deinstallieren, da einige Objekte erst bei der Insatallation angelegt werden.

Bei der Insatallation unter Windows muss zusätzlich noch open-ssl installiert werden.Und ggf. der Pfad in lib/landroid-cloud.js geändert werden (wird noch geändert)

## Changelog

#### 0.2.2
* (MeisterTR) supported change of mowing times and error catching
#### 0.1.2
* (MeisterTR) add moving data
#### 0.0.1
* (MeisterTR) initial release

## License
The MIT License (MIT)

Copyright (c) 2017 @@Author@@ <@@email@@>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
