Operating system: Windows

File system: NTFS

1. Instead of deleting download, sparse it to free some space(<sparse_length>)
2. Stop files download.
3. Recheck download.
4. Continue seeding.

```
Usage:
	cscript sparser.js torrent <sparse_length> <torrent_path> <torrent_file>
	cscript sparser.js (ed2k|ipfs|tth) <sparse_length> <file_path>
	cscript sparser.js <block_size> <sparse_length> <file_path>
```	

```<sparse_length>``` - Length in bytes or percent(20%) of current data length to sparse. It will be aligned by block_size.

```<torrent_path>``` - Full path where downloaded data stored.

```<torrent_file>``` - Full path to [.torrent file](https://en.wikipedia.org/wiki/Torrent_file) that contains metadata about files and folders.

```<file_path>``` - Full path to file to sparse.

```<block_size>``` - Minimum sparse range length. 

Example:

```
cscript sparser.js torrent 10% "downloads/iso/" "linux.iso.torrent"
cscript sparser.js torrent 100000000 "downloads/iso/" "linux.iso.torrent"
cscript sparser.js ed2k 23% "downloads/iso/linux.iso"
cscript sparser.js 1024 23% "downloads/iso/linux.iso"
```
