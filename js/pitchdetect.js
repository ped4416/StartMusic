/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

//set up the WebKit. 
var audioContext = new AudioContext();
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var detectorElem, 
	canvasContext,
	pitchElem,
	noteElem,
	detuneElem,
	detuneAmount;
var WIDTH=300;
var CENTER=150;
var HEIGHT=42;
var confidence = 0;
var currentPitch = 0;


//create an array to hold all the incoming frequencies. 
var pitchInArr = new Array();
var freq;
var noteInScale;
//booleans to control the states of the notes
var array1 = true;//new Boolean("true");

//create arrays to go through note values
   //the set of all frequencies we are looking for
var scales = new Object();
//currently in HZ convert all to Midi notes? 
//scales.a = new Array(110, 220, 440, 880);
//scales.c = new Array(32.703, 32.703*2, 32.703*4, 32.703*8);

//and a midi note version to cover all 12 semitones from C4 to B8
scales.c = new Array(36, 48, 60, 72, 84, 96, 108);
scales.cSh = new Array(37, 49, 61, 73, 85, 97, 109);
scales.d = new Array(38, 50, 62, 74, 86, 98, 110);
scales.dSh = new Array(39, 51, 63, 75, 87, 99, 111);
scales.e = new Array(40, 52, 64, 76, 88, 100, 112);
scales.f = new Array(41, 53, 65, 77, 89, 101, 113);
scales.fSh = new Array(42, 54, 66, 78, 90, 102, 114);
scales.g = new Array(43, 55, 67, 79, 91, 103, 115);
scales.gSh = new Array(44, 56, 68, 80, 92, 104, 116);
scales.a = new Array(45, 57, 69, 81, 93, 104, 117);
scales.aSH = new Array(46, 58, 70, 82, 94, 105, 118);
scales.b = new Array(47, 59, 71, 83, 95, 106, 119);

//these are the frequences we have captured for a C Major scale. 
var freqs = new Array(71, 74, 76, 77, 79, 81, 83, 84);

	var avg_count = 4;
var averages = new Array();
var ind = 0;

var boundary_note_val = 9;

var notes = new Array(20, 10, 10, 20, 10, 10, 10, 10, 10, 10, 
10, 10, 10, 10, 10, 10, 20, 20, 20, 20, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11, 10, 19, 10, 20, 10 , 10, 10, 10);

/* TODO
Compute the amplitude of incoming signal and constrain it to only come on when a certain threshold is reached? 
*/

window.onload = function() {
    //request a file to upload
	var request = new XMLHttpRequest();
	//the file path to load in the sound. True is simply to say load 
	//asynchronously and let us know when it is loaded. 
	request.open("GET", "sounds/PianoC_StartMusic.wav", true);
	//get the raw binary data from the wav file. 
	request.responseType = "arraybuffer";
	//need on load function. 
	request.onload = function() {
	//pass the file from load operation into a buffer. 
	  audioContext.decodeAudioData( request.response, function(buffer) { 
	    	theBuffer = buffer;
		} );
	}
	//finally load the file.. 
	request.send();

    
	detectorElem = document.getElementById( "detector" );
	pitchElem = document.getElementById( "pitch" );
	noteElem = document.getElementById( "note" );
	detuneElem = document.getElementById( "detune" );
	detuneAmount = document.getElementById( "detune_amt" );
	canvasContext = document.getElementById( "output" ).getContext("2d");

	detectorElem.ondragenter = function () { 
		this.classList.add("droptarget"); 
		return false; };
	detectorElem.ondragleave = function () { this.classList.remove("droptarget"); return false; };
	detectorElem.ondrop = function (e) {
  		this.classList.remove("droptarget");
  		e.preventDefault();
		theBuffer = null;

	  	var reader = new FileReader();
	  	reader.onload = function (event) {
	  		audioContext.decodeAudioData( event.target.result, function(buffer) {
	    		theBuffer = buffer;
	  		}, function(){alert("error loading!");} ); 

	  	};
	  	reader.onerror = function (event) {
	  		alert("Error: " + reader.error );
		};
	  	reader.readAsArrayBuffer(e.dataTransfer.files[0]);
	  	return false;
	};



}
//make sure an alert is sent if the Audio API fails
function error() {
    alert('Stream generation failed.');
}

function getUserMedia(dictionary, callback) {
    try {
        navigator.getUserMedia = 
        	navigator.getUserMedia ||
        	navigator.webkitGetUserMedia ||
        	navigator.mozGetUserMedia;
        navigator.getUserMedia(dictionary, callback, error);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
}

//this is from WebAudio. It requests the audio input stream. 
//then a node can be connected to anything... 
function gotStream(stream) {
    // Create an AudioNode from the stream.
    var mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Connect it to the destination.
    analyser = audioContext.createAnalyser();
    //set the FFT window size to 2048
    analyser.fftSize = 2048;
    //assign the window size to the input stream to divide into appropriate sized blocks.
    mediaStreamSource.connect( analyser );
    //call the updated pitch that has had auto correlation applied. 
    updatePitch();
}

function toggleLiveInput() {
    getUserMedia({audio:true}, gotStream);
}

//this allows the sample to by played or stopped.. 
//need to load in multiple samples to play randomly here?
function togglePlayback() {
    var now = audioContext.currentTime;

    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( now );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
        return "start";
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = theBuffer;
    //do we want the sample to loop? set to true or false.. 
    //Set sample to false to get a full array in of the audio file.
    //sourceNode.loop = true;
    sourceNode.loop = false;

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect( analyser );
    analyser.connect( audioContext.destination );
    sourceNode.start( now );
    isPlaying = true;
    isLiveInput = false;
    updatePitch();

    return "stop";
}

var rafID = null;
var tracks = null;
var buflen = 2048;
var buf = new Uint8Array( buflen );
var MINVAL = 134;  // 128 == zero.  MINVAL is the "minimum detected signal" level.

/*
function findNextPositiveZeroCrossing( start ) {
	var i = Math.ceil( start );
	var last_zero = -1;
	// advance until we're zero or negative
	while (i<buflen && (buf[i] > 128 ) )
		i++;
	if (i>=buflen)
		return -1;

	// advance until we're above MINVAL, keeping track of last zero.
	while (i<buflen && ((t=buf[i]) < MINVAL )) {
		if (t >= 128) {
			if (last_zero == -1)
				last_zero = i;
		} else
			last_zero = -1;
		i++;
	}

	// we may have jumped over MINVAL in one sample.
	if (last_zero == -1)
		last_zero = i;

	if (i==buflen)	// We didn't find any more positive zero crossings
		return -1;

	// The first sample might be a zero.  If so, return it.
	if (last_zero == 0)
		return 0;

	// Otherwise, the zero might be between two values, so we need to scale it.

	var t = ( 128 - buf[last_zero-1] ) / (buf[last_zero] - buf[last_zero-1]);
	return last_zero+t;
}
//*/

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFromPitch( frequency ) {
	var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
        //not sure what this is doing? printing out the return value gives numbers that go from 5000 to - numbers
        //console.log("PitchMidiNote = " + Math.round( noteNum ) + 69);
	return Math.round( noteNum ) + 69;
        
}

function frequencyFromNoteNumber( note ) {
        //print out the frequency to console
        //console.log("Pitch Midi Note = " + note);
        //console.log("Pitch Midi Note = " + 440 * Math.pow(2,(note-69)/12));
	return 440 * Math.pow(2,(note-69)/12);//this formula gives the midi notes version value of frequency 
}

function centsOffFromPitch( frequency, note ) {
	return ( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}

// this is a float version of the algorithm below - but it's not currently used.
/*
function autoCorrelateFloat( buf, sampleRate ) {
	var MIN_SAMPLES = 4;	// corresponds to an 11kHz signal
	var MAX_SAMPLES = 1000; // corresponds to a 44Hz signal
	var SIZE = 1000;
	var best_offset = -1;
	var best_correlation = 0;
	var rms = 0;

	if (buf.length < (SIZE + MAX_SAMPLES - MIN_SAMPLES))
		return -1;  // Not enough data

	for (var i=0;i<SIZE;i++)
		rms += buf[i]*buf[i];
	rms = Math.sqrt(rms/SIZE);

	for (var offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
		var correlation = 0;

		for (var i=0; i<SIZE; i++) {
			correlation += Math.abs(buf[i]-buf[i+offset]);
		}
		correlation = 1 - (correlation/SIZE);
		if (correlation > best_correlation) {
			best_correlation = correlation;
			best_offset = offset;
		}
	}
	if ((rms>0.1)&&(best_correlation > 0.1)) {
		console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")");
	}
//	var best_frequency = sampleRate/best_offset;
}
*/


//this is the algorithm to understand!
//it takes the buffer size of 2048 and  a sample rate of 44100. 
function autoCorrelate( buf, sampleRate ) {

    //this is the standard auto corrilation algorithm
	var MIN_SAMPLES = 4;	// corresponds to an 11kHz signal
	var MAX_SAMPLES = 1000; // corresponds to a 44Hz signal
	var SIZE = 1000;//this correlates to the window size?
	//var SIZE = 2000; 
	var best_offset = -1;//a variable to offset the phases for comparing intensities. 
	var best_correlation = 0;
	var rms = 0;


	confidence = 0;
	currentPitch = 0;

	if (buf.length < (SIZE + MAX_SAMPLES - MIN_SAMPLES))
		return;  // Not enough data
    
        //iterate 1000 times over the initial signal
	for (var i=0;i<SIZE;i++) {
		var val = (buf[i] - 128)/128;//normalising power spectrum.  
		rms += val*val;
	}
	
	//square the result values. 
	rms = Math.sqrt(rms/SIZE);//average rms for buffer

    
	for (var offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
		var correlation = 0;//local variable to store the offset correlations
               
        //iterate through and offset up to window size(SIZE).. Same as MAX_SAMPLES
		for (var i=0; i<SIZE; i++) {
			correlation += Math.abs(((buf[i] - 128)/128)-((buf[i+offset] - 128)/128));//calculating value between 0 and 1 using absolute value to normailse signal. 
                       
		}
		correlation = 1 - (correlation/SIZE);//
		if (correlation > best_correlation) {
			best_correlation = correlation;
			best_offset = offset;
		}
	}

	//adjust threshold? Get it less twitchy. Lengthen the sample length? Stop fluctuation? 
	//if ((rms>0.1)&&(best_correlation > 0.1)) {
	if ((rms>0.01)&&(best_correlation > 0.01)) {

	
		confidence = best_correlation * rms * 10000;
		currentPitch = sampleRate/best_offset;
		// console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
        //console.log("frequecy = " +  currentPitch + "Hz");//gives the frequncy
        //console.log("Confidence = " +  confidence );//gives the frequncy
    }
}

//get all pitches into a buffer. 
//then vibrato filter. 
//try a low pass filter to the input. 
//apply an averaging filter. 
//an average over the length of a quaver. 
//short term averaging
//if current average jumps move onto next note. 


function updatePitch( time ) {
	var cycles = new Array;
	analyser.getByteTimeDomainData( buf );

    //send the current pitch down to a new function to fill the array. 
    fillArrayWithNotes(currentPitch);
       
//	var best_frequency = sampleRate/best_offset;

	/*
	// old zero-crossing code

		var i=0;
		// find the first point
		var last_zero = findNextPositiveZeroCrossing( 0 );

		var n=0;
		// keep finding points, adding cycle lengths to array
		while ( last_zero != -1) {
			var next_zero = findNextPositiveZeroCrossing( last_zero + 1 );
			if (next_zero > -1)
				cycles.push( next_zero - last_zero );
			last_zero = next_zero;

			n++;
			if (n>1000)
				break;
		}

		// 1?: average the array
		var num_cycles = cycles.length;
		var sum = 0;
		var pitch = 0;

		for (var i=0; i<num_cycles; i++) {
			sum += cycles[i];
		}

		if (num_cycles) {
			sum /= num_cycles;
			pitch = audioContext.sampleRate/sum;
		}

	// confidence = num_cycles / num_possible_cycles = num_cycles / (audioContext.sampleRate/)
		var confidence = (num_cycles ? ((num_cycles/(pitch * buflen / audioContext.sampleRate)) * 100) : 0);


	/*
		console.log( 
			"Cycles: " + num_cycles + 
			" - average length: " + sum + 
			" - pitch: " + pitch + "Hz " +
			" - note: " + noteFromPitch( pitch ) +
			" - confidence: " + confidence + "% "
			);
	*/
		// possible other approach to confidence: sort the array, take the median; go through the array and compute the average deviation
		autoCorrelate( buf, audioContext.sampleRate );

	    // 	detectorElem.className = (confidence>50)?"confident":"vague";

		canvasContext.clearRect(0,0,WIDTH,HEIGHT);

	 	if (confidence <10) {
	 		detectorElem.className = "vague";
		 	pitchElem.innerText = "--";
			noteElem.innerText = "-";
			detuneElem.className = "";
			detuneAmount.innerText = "--";
	 	} else {
		 	detectorElem.className = "confident";
		 	pitchElem.innerText = Math.floor( currentPitch ) ;
		 	//console.log("frequecy = " +  currentPitch + "Hz");//gives the frequncy
		 	var note =  noteFromPitch( currentPitch );
			noteElem.innerHTML = noteStrings[note%12];
			var detune = centsOffFromPitch( currentPitch, note );
			if (detune == 0 ) {
				detuneElem.className = "";
				detuneAmount.innerHTML = "--";

				// TODO: draw a line.
			} else {
				if (Math.abs(detune)<10)
					canvasContext.fillStyle = "green";
				else
					canvasContext.fillStyle = "red";

				if (detune < 0) {
		  			detuneElem.className = "flat";
				}
				else {
					detuneElem.className = "sharp";
				}
	  			canvasContext.fillRect(CENTER, 0, (detune*3), HEIGHT);
				detuneAmount.innerHTML = Math.abs( Math.floor( detune ) );
			}
	}

	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame( updatePitch );
       
}

//a function to fill an array with the currentPitchValues but make sure they are smoothed 
//as they are a little noisy. 
//Use MIDI notes rather than frequency.. 
function fillArrayWithNotes(currentPitchToArray)
{    
        
    //need an if statement to remove the noise in the incoming signal 11025hz seems to be a
    //common error as well as 0 frequency readings
    if(currentPitchToArray < 10000 && currentPitchToArray > 80)
    {
       
       //convert the frequencies to MIDI notes here. 
       var noteToMidi = 69 + 12*Math.log(currentPitchToArray/440)/Math.log(2);
       //console.log("The Pitch Value Is Now = " + noteToMidi);//print out the array
	   /******************************************************************
	   fill an array with all the current notes coming in .. COMPLETED!
	   ******************************************************************/
       


       //closure behaviour 
       //add the frequecies to the array given from the addToArr function
       addToArr(pitchInArr);

       function addToArr(inarr){
	       	//for (var i = 0; i < 1; i ++)
       	    //{
       	  	 //inarr[inarr.length] = (currentPitchToArray);
       	  	 inarr.push(Math.round(noteToMidi));
       	    //}
       	    //console.log("The Pitch Value Is Now = " + inarr);//print out the array
        }
      
	       //allow the last array ellement to be printed
	       var lastIndex = (pitchInArr[pitchInArr.length -1]);//get last index to be added make sure it is parsed to be usable 
		   console.log("LastIndex = " + lastIndex);
	
			/******************************************************************
			   build an averager method to select boundaries 
			   need to create a moving average filter?
			   here is a link to a pseudo code version. 
			   http://rosettacode.org/wiki/Averages/Simple_moving_average
			   http://stackoverflow.com/questions/3760506/smoothing-values-over-time-moving-average-or-something-better

			   May need datamining k nearest neighbour perhaps?
			*******************************************************************/

		//constrain the length of the array using an if statement so website does not crash!
    	if(pitchInArr.length < 200)
    	{

            /* method to compare elements and remove the harmonics from the array by assigning all incoming pitches to 
            definite notes in the scales 
            */  

         
            console.log("I am here");
			//iterate the captured freqs and figure out which note each one is
			for (var i=0;i<pitchInArr.length;i++)
			{
			  freq = pitchInArr[i];
			  //console.log("Looking for note of "+freq);
			  for (noteInScale in scales)
			  {
			      //console.log("Checking if "+noteInScale+" is the note for "+freq);
			      //console.log(scales[noteInScale]);

			    // now look in the frequencies for this note
			    for (var j=0;j<scales[noteInScale].length; j++)
			    {
			       if (scales[noteInScale][j] == freq){// we found it!
			          console.log(""+freq+" is a "+noteInScale);
			          //console.log(freq);
			          var filteredNote = freq;
			       }
                    
			       //return filteredNote;
			    }
			  }
			}
            
			// console.log("I need a new note " + filteredNote);
			// // random notes
			// var notes = new Array();
			// for (var i=0;i<20;i++){
			//     notes[i] = Math.random() * 127;
			// }
			// // round them up
			// console.log(notes);
			// for (var i=0;i<notes.length;i++){
			//     notes[i] = Math.round(notes[i]);
			// }
			// console.log("Notes rounded = " + notes);

			//this example has some nasty changes and it still singles out the 2 note changes.
			//it starts with 10.. then 20 then back to 10. 
			//need to find a way to give the first group of notes
			//var notes = new Array(20, 10, 10, 20, 10, 10, 10, 10, 10, 10, 
			//10, 10, 10, 10, 10, 10, 20, 20, 20, 20, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11, 10, 19, 10, 20, 10 , 10, 10, 10);
			//console.log("Notes = " + notes);

			// calculate the moving average 'avg_count' points over the notes array
		
			//var firstNote = new Array();
			//var firstN = 0;

			//I needed to add a -1 to the average count to catch [0] from notes 
			for (var i=avg_count-1; i < pitchInArr.length;i++)
			{
			    //averages[ind] = (notes[i] + notes[i-1] + notes[i-2]) / 3;
			    averages[ind] = 0;
			    for (var j = 0; j<avg_count; j++)
			    {
			      averages[ind] += pitchInArr[i-j];
			      
			    }

			    var averagePass = averages[ind] = averages[ind] / avg_count; 
			    
			    //add in a statement to show prediction of a note change using a boundary value relevant to midi or frequency?
			    if(averages[ind] > averages[ind - avg_count] + boundary_note_val || averages[ind] < averages[ind - avg_count] - boundary_note_val){
			       
			       // //give the first note of the array ?? 
			       // for(var k = 0; k < notes[ind]; k ++)
			       // {
			       //  firstNote += notes[j];
			       //  console.log("First note of array in = " + firstNote);
			       // }  

			       console.log("The note has changed");
			       console.log(averages[ind]);//print out the equvalent note value of the input notes
			    }
			    //console.log("Trial = " + averagePass);
			    averages[ind] = Math.round(averages[ind]);
			    ind ++ ;
			}
			    
			//console.log(averages);
		}



            

           
        

            

		/*******************************************************************
		calculate the average note value of each region to give the melody
		********************************************************************/
		 
    }
}

