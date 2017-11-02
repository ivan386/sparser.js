var file_system = WScript.CreateObject("Scripting.FileSystemObject");
var shell = WScript.CreateObject("WScript.Shell");
var path_splitter = "\\";

function log(text){	WScript.Echo( text ); }

function read_all_to_log(stream)
{
	var result = stream.ReadAll();
	if ( result.length )
		log( result );
	return result;
}

function read_all_file(file_path)
{
	log(file_path)
	var file = file_system.OpenTextFile( file_path );
	var data = file.ReadAll();
	file.Close();
	return data;
}

function run(command)
{
	var stream = shell.Exec( command );
	
	log( command );
	read_all_to_log( stream.StdErr );
	return read_all_to_log( stream.StdOut );
}

function setflag(file_path){ run( 'fsutil sparse setflag "' + file_path + '"' ); }

function setrange(file_path, offset, length)
{
	run( 'fsutil sparse setrange "' + file_path + '" '+ offset + ' ' + length );
}

function open_sparse_ranges(file_path, write)
{
	if ( write )
		return file_system.OpenTextFile( file_path + ":sparse_ranges", 2, true );
	else if ( is_file_exists( file_path + ":sparse_ranges" ) )
		return file_system.OpenTextFile( file_path + ":sparse_ranges" );
}

function close_sparse_ranges(sparse_ranges){ sparse_ranges.Close(); }

function write_range(ranges_stream, start, length)
{	
	ranges_stream.WriteLine(start + " " + length); 
}

function read_range(ranges_stream)
{
	var line;
	if( ( ! ranges_stream.AtEndOfStream ) && ( line = ranges_stream.ReadLine() ) )
	{
		var range = line.split( " " );
		return { start: parseInt( range[0] ), length: parseInt( range[1] ) };
	}
}

function is_file_exists( file_path ){ return file_system.FileExists( file_path ); }

function is_folder_exists( folder_path ){ return file_system.FolderExists( folder_path ); }

function get_file_size(file_path)
{
	if ( is_file_exists( file_path ) )
	{
		var file_info = file_system.GetFile( file_path );
		if ( file_info )
			return file_info.Size;
	}
	log("file not exists: " + file_path)
}

function help()
{
	log("Usage:");
	log("cscript sparser.js torrent <sparse_length> <torrent_path> <torrent_file>");
	log("cscript sparser.js (ed2k|ipfs|tth) <sparse_length> <file_path>");
	log("cscript sparser.js <block_size> <sparse_length> <file_path>");
}

function main()
{
	if (WScript.Arguments.Length >= 3)
	{
		var type = WScript.Arguments.Item(0);
		var sparse_length = parseInt( WScript.Arguments.Item(1) );
		if ( sparse_length > 0  )
		{
			
			var file_path = WScript.Arguments.Item(2);
			
			switch(type)
			{
				case "ed2k":
				
					sparse_random_blocks(0, sparse_length, 9728000, file_path);
				
				break;
				case "ipfs":
				
					sparse_random_blocks(0, sparse_length, 256 * 1024, file_path);
					
				break;
				case "tth":
				
						var tth_block_size = get_tth_block_size( file_path );
						if ( tth_block_size )
							sparse_random_blocks(0, sparse_length, tth_block_size, file_path);
						else
							help();
						
				break;
				case "torrent":
				
					if (WScript.Arguments.Length == 4)
					{
						var torrent_path = WScript.Arguments.Item(2);
						var torrent_file = WScript.Arguments.Item(3);
				
						sparse_torrent_random(sparse_length, torrent_file, torrent_path);
					}
					else
						help();
					
				break;
				default:
				
					var block_size = parseInt( WScript.Arguments.Item(0) );
					if ( block_size > 0 )
						sparse_random_blocks( 0, sparse_length, block_size, file_path );
					else
						help();
			}
		}
		else
			help();
	}
	else
		help();
}

function get_tth_block_size( file_path )
{
	// Shareaza splits the file into 256 blocks max (9 levels)
	// Flylink splits the file into 512 blocks max (10 levels)
	// Use largest block size
	var file_size = get_file_size( file_path );
	if ( file_size )
	{
		var max_file_size = 1024 << 8;
	
		for(;file_size > max_file_size;) 
			max_file_size <<= 1;
		
		return max_file_size >> 8;
	}
}

function sparse_all_file(file_path, file_size)
{
	var sparse_ranges = open_sparse_ranges( file_path, true );
	setflag( file_path );
	setrange( file_path, 0, file_size );
	write_range( sparse_ranges, 0, file_size );
	close_sparse_ranges( sparse_ranges );
}

function sparse_blocks_map(blocks_offset, blocks_map, blocks_map_offset, block_size, file_path)
{
	var file_size = get_file_size( file_path );
	
	if ( file_size )
	{
		var file_blocks_end = Math.min( blocks_map.length, 
				blocks_map_offset + Math.ceil ( ( file_size - blocks_offset ) / block_size ) );
		
		setflag( file_path );
		
		var sparse_ranges = open_sparse_ranges( file_path, true );
		
		for(var i = blocks_map_offset; i < file_blocks_end; i++)
			if ( blocks_map[ i ] )
			{
				var sparse = ( blocks_map[ i ] == 1 );
				
				var range_start  = blocks_offset + ( i - blocks_map_offset ) * block_size;
				
				var range_length = block_size;
				
				if( range_start < 0 )
				{
					range_length += range_start;
					range_start  =  0;
				}
				
				for (;file_blocks_end > ( i + 1 ) && blocks_map[ i + 1 ]; i++)
				{
					if ( ! sparse ) 
						sparse = ( blocks_map[ i + 1 ] == 1 );
					
					range_length += block_size;
				}
				
				if ( range_start + range_length > file_size )
					range_length = file_size - range_start;
				
				if ( sparse )
					setrange( file_path, range_start, range_length );
				
				write_range( sparse_ranges, range_start, range_length );
			}
			
		close_sparse_ranges(sparse_ranges);

		return true;
	}
}

function fill_sparse_blocks(blocks_offset, blocks_map, blocks_map_offset, block_size, file_path)
{
	var sparse_blocks = 0;
	var sparse_ranges = open_sparse_ranges( file_path );
	
	if ( sparse_ranges )
	{
		for ( var range; range = read_range( sparse_ranges ); )
		{
			var block_index = Math.floor( ( range.start - blocks_offset ) / block_size );
			
			if ( ( range.start - blocks_offset ) % block_size )
				block_index++;
			
			for (;			  
			  range.start - blocks_offset + range.length > block_index * block_size;
			  block_index++ 
			)
				if ( ! blocks_map[ blocks_map_offset + block_index ] )
				{
					sparse_blocks++;
					blocks_map[ blocks_map_offset + block_index ] = 2;
				}
		}
		
		close_sparse_ranges( sparse_ranges );
	}
	
	return sparse_blocks;
}

function select_random_blocks( sparse_count, max_count, blocks_map )
{
	for (var selected_count = 0; selected_count < sparse_count; selected_count++)
	{
		var random_block = Math.floor( Math.random() * max_count )
		
		for (; blocks_map[ random_block ];)
		{
			if ( random_block >= max_count - random_block )
				random_block = Math.floor( Math.random() * random_block );
			else
				random_block = random_block + 1 + Math.ceil( Math.random() * ( max_count - random_block - 1 ) );
		}
		
		blocks_map[ random_block ] = 1;
	}
}

function sparse_random_blocks(blocks_offset, sparse_length, block_size, file_path)
{
	
	var sparse_count = Math.ceil( sparse_length / block_size );
	
	var file_size = get_file_size( file_path )
	
	if ( file_size )
	{
		var blocks_map = [];
		var sparse_blocks = fill_sparse_blocks( blocks_offset, blocks_map, 0, block_size, file_path );
		
		if ( block_size * ( sparse_count + sparse_blocks ) >= file_size - blocks_offset )
			return sparse_all_file(file_path, file_size);
		else
		{
			var max_count = Math.ceil ( ( file_size - blocks_offset ) / block_size );
			select_random_blocks( sparse_count, max_count, blocks_map );
			return sparse_blocks_map( blocks_offset, blocks_map, 0, block_size, file_path );
		}
	}
}

function decode_bencode(data)
{
	data = escape( data );
	
	var stack = [];
	
	var error = function(data, index, msg)
	{
		if ( msg ) log( msg );
		if ( index > 0 )
		{
			log( 'error at ' + index + ": " + data.charAt( index ) );
			log( 'rest of data: ' + unescape( data.substr( index ) ) );
		}
	}
	
	for(var i = 0; i < data.length; i++ )
	{
		switch( data.charAt( i ) )
		{
			case 'd': // dictionary
			
				stack.push( {} );
			
			continue;
			case 'l': // list
			
				stack.push( [] );
			
			continue;
			case 'i': // integer
			
				var e = data.indexOf( 'e', i );
				if (e <= i)
					return error( data, i, "end of integer('e') not found" );
				
				stack.push( parseInt( data.slice( i + 1, i = e ) ) );
				
			break;
			default: // unknown
			
				return error( data, i, "unknown data type" );
			
			case '0': case '1':	case '2': case '3': 
			case '4': case '5':	case '6': case '7':
			case '8': case '9': //string
			
				var e = data.indexOf( '%3A', i ); // ':'
				
				if (e <= i)
					return error( data, i, "end of string length(':') not found" );
				
				var string_length = parseInt( data.slice( i, e ) );
				
				var count = 0;
				
				for 
				(
					var x = data.indexOf( "%", e += 3 );
					( i = e + string_length + count) >= x && ( x >= e );
					x = data.indexOf( "%", x + 1 ) 
				)
					count += ( data.charAt( x + 1 ) == "u" ) ? 5 : 2;

				stack.push( unescape( data.slice( e, i-- ) ) );

			case 'e': // end of dictionary or list
		}
		
		if (stack.length > 1)
		{
			var list = stack[stack.length - 2];
			switch ( typeof( list ) )
			{
				
				case 'object':
				// It is list or dictionary
					
					if ( typeof( list.push ) == 'function' )
						// It is list
						list.push( stack.pop() );

				break;
				
				
				case 'string': 
				// It is key for dictionary
				
					var dictionary = stack[ stack.length - 3 ];
					if ( typeof( dictionary ) == "object" )
					{
						var value = stack.pop();
						var key = stack.pop();
						dictionary[ key ] = value;
						break;
					}
					
				default:
					return error( data, i, "wrong key or dictionary type" );
			}
		}
		else
			return stack.pop();
	}
	return error( data, -1, "unexpected end of data" );
}

function sparse_torrent_random(sparse_length, torrent_file, torrent_path)
{
	var torrent_dict = decode_bencode( read_all_file( torrent_file ) );

	var files = [];
	var block_size = torrent_dict.info["piece length"];
	
	var length = 0;
	
	var check_file_length = function(file)
	{
		if ( is_file_exists( file.path ) )
			return get_file_size( file.path ) == file.length;
		
		log("file not exist: " + file.path);
	}
	
	var blocks_map = [];
	var sparse_blocks = 0;
	
	if ( torrent_path.slice( -1 ) == path_splitter )
		torrent_path = torrent_path.slice( 0, -1 );
	
	if ( torrent_dict.info.files )
	{
		if ( is_folder_exists( torrent_path ) )
		{
			var torrent_path_with_name = torrent_path + path_splitter + torrent_dict.info.name
			if ( is_folder_exists( torrent_path_with_name ) )
				torrent_path = torrent_path_with_name;
			else if( torrent_path.slice( -torrent_dict.info.name.length ) != torrent_dict.info.name)
				return log("folder not exists: " + torrent_path_with_name);
		}
		else
			return log("folder not exists: " + torrent_path);

		for (var i = 0; i < torrent_dict.info.files.length; i++)
		{
			var file = torrent_dict.info.files[i];
			
			if ( typeof( file ) != "object" )
				return ;
			
			if ( file.length == 0 )
				continue;
			
			file.path.unshift( torrent_path );
			file.path               = file.path.join( path_splitter );
			file.blocks_offset      = -( length % block_size );
			file.blocks_map_offset  = Math.floor( length / block_size );

			length += file.length;
			
			if ( ! check_file_length( file ) )
				return;
			
			sparse_blocks += fill_sparse_blocks( file.blocks_offset, blocks_map,
					file.blocks_map_offset, block_size, file.path );
			
			files.push( file );
		}
	}
	else
	{
		var file = torrent_dict.info;
		
		if ( typeof( file ) != "object" )
			return;
		
		if ( file.length == 0 )
			return true;
		
		file.blocks_offset        = 0;
		file.blocks_map_offset = 0;
		file.path          = torrent_path + path_splitter + file.name;
		
		length             = file.length;
		
		if ( ! check_file_length( file ) )
			return;
		
		sparse_blocks += fill_sparse_blocks( file.blocks_offset, blocks_map,
				           file.blocks_map_offset, block_size, file.path );
		
		files.push( file );
	}

	if ( length > 0 )
	{
		var max_count = Math.ceil ( length / block_size );
		var new_sparse_count = Math.ceil( sparse_length / block_size );
		
		if ( new_sparse_count < max_count - sparse_blocks )
		{
			select_random_blocks( new_sparse_count, max_count, blocks_map );
			
			for ( var i = 0, file = files[i]; file; file = files[++i] )
				if ( ! sparse_blocks_map( file.blocks_offset, blocks_map,
						 file.blocks_map_offset, block_size, file.path ) )
					return false;
		}
		else
			for ( var i = 0, file = files[i]; file; file = files[++i] )
				sparse_all_file( file.path, file.length );

		return true;
	}
}

main()


