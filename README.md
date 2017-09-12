![Logo](admin/landroid-s.png)
ioBroker.landroid-s
=============

[![NPM version](http://img.shields.io/npm/v/iobroker.landroid-s.svg)](https://www.npmjs.com/package/iobroker.landroid-s)
[![Downloads](https://img.shields.io/npm/dm/iobroker.landroid-s.svg)](https://www.npmjs.com/package/iobroker.landroid-s)
[![bitHound Overall Score](https://www.bithound.io/github/MeisterTR/ioBroker.landroid-s/badges/score.svg)](https://www.bithound.io/github/MeisterTR/iobroker.landroid-s)

[![NPM](https://nodei.co/npm/iobroker.landroid-s.png?downloads=true)](https://nodei.co/npm/iobroker.landroid-s/)

**Tests:** Linux/Mac: [![Travis-CI](https://api.travis-ci.org/MeisterTR/ioBroker.landroid-s.svg?branch=master)](https://travis-ci.org/MeisterTR/ioBroker.landroid-s)
Windows: [![AppVeyor](https://ci.appveyor.com/api/projects/status/github/MeisterTR/ioBroker.landroid-s?branch=master&svg=true)](https://ci.appveyor.com/project/MeisterTR/ioBroker-landroid-s/)


Dieser Adapter verbindet IoBroker mit deinem Landroid S Modell 2017
Es werden Temperaturen, Mähzeiten, Akkustand und diverse weitere Daten ausgelesen
Ebenso kann er durch den Adapter gesteuert werden und die Konfiguration geändert werden.

## Installation
Es muss mindestens Node 4.X.X Installiert sein, Node 0.10 und 0.12 werden von diesem Adapter nicht mehr unterstützt.

Bei der Installation unter Windows muss zusätzlich noch open-ssl installiert werden. Der Standardpfad ist in der Konfig hinterlegt, sollte dieser abweichen, muss er in der Konfig. angepasst werden.

## Einstellungen
- Bei E-mail und Passwort müssen die Daten eingeben werden, mit denen man bei Worx registriert ist.
- Die Mac Adresse findet man, wenn man in der App auf erweiterte Einstellungen geht.
- Der Intervall ist der Abstand in dem die Werte aktualisiert werden.  Dies ist aber nur interessant für den Akkustand und andere, da der Roboter bei wichtigen Ereignissen (Error oder Mähen) selber Nachrichten an den Adapter schickt.

### Wechsel von 0.X.X auf 1.X.X
Bitte Adapter vor Update deinstallieren, da einige Objekte erst bei der Installation angelegt werden.


## Changelog
#### 1.0.3 (08.09.2017)
* (MeisterTR) change Values from vis did not work (Fixed)
* (MeisterTR) changeing path from OpenSSL.exe on Windows now in config
* (MeisterTR) chatch errors on start if config is not set
* (MeisterTR) some other changes
#### 0.3.1 (12.08.2017)
* (MeisterTR) bugfix cound not set bordercut to false
* (MeisterTR) add checkbox for m and min.
* (MeisterTR) add rawdata, chargecycle and actualArea
#### 0.2.5
* (MeisterTR) now every parameter can be configure
#### 0.2.3
* (MeisterTR) add areas, supporting change areas
#### 0.2.2
* (MeisterTR) supported change of mowing times and error catching
#### 0.1.2
* (MeisterTR) add mowing data
#### 0.0.1
* (MeisterTR) initial release
 
## License
The MIT License (MIT)

Copyright (c) 2017 MeisterTR <meistertr.smarthome@gmail.com>

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
