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
//booleans to control the states of the notes
var array1 = true;//new Boolean("true");

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
      
        var counter = 0; // to keep track of the number of samples coming in?
        var sum = 0;//variable to store the sum of initial array
        var startingTotal = 0;//give the total length of initial array

        //attempt to remove harmonic content from the array
  //       for(var i = 0; i < 10; i ++)
		// {
	 //    	// append new value to the array
		//     inarr[inarr.length] = (currentPitch);//add a new note reading to the array (no quotes!! "" ) 
		//     console.log("CurrentPitch = " + currentPitch);
		     

		//     //remove elemnts from array that are not pure tones
		//     //if(inarr[i] * 2 == inarr[i])
		//     // if(inarr.indexOf(lastIndex)
		//     // {
		//     // 	inarr.indexOf[i];
		//     // 	inarr[i].splice([i], 1);//delete the harmonic elements.
		//     // }

		//     console.log("Array values = " + inarr[i]);
		// }  

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
       	  	 inarr.push(currentPitchToArray);//need to add i as the array element? 
       	    //}
       	    //return console.log("The Pitch Value Is Now = " + inarr);//print out the array
        }
       

      
	       //allow the last array ellement to be printed
	       var lastIndex = (pitchInArr[pitchInArr.length -1]);//get last index to be added make sure it is parsed to be usable 
		   //console.log("LastIndex = " + lastIndex);
	
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
    	//{
    	//if(pitchInArr.length > 180)
    	{

    
			 var indexChange;//variable to define the index boundaries if the moving average jumps more than a certain amount. 
			 var confidenceOfBoundaryChange;//variable to track the confidence of a possible change. 
			 var smallestBoundary = 1;//using midinotes or Frequency will alter this..  
			 var largestBoundary = 2;//using midinotes or Frequency will alter this.. 
			
	         
 
            /* method to compare elements and remove the harmonics from the array. This seems to
            be creating an error in reading the array lengths. Need this to work to remove elements. 

            */   

            //var filteredArr = new Array();
            //filterHarmonics(filteredArr);//add the filtered notes into a new array. 

            //console.log("Filtered Array = " + filteredArr);

            //function filterHarmonics(filter){
				for(var i = 0; i < pitchInArr.length; i ++)
			    {
			    	for(var j = 1; j < pitchInArr.length; j ++)//compares 1 element above first
			    	{
			    		for(var k = 2; k < pitchInArr.length; k ++)//compares 2 elements above the first
			    		{
			    			//four variables to remove twitchy harmonics in a range.
							var jmax = pitchInArr[j] + 10;
			    			var jmin = pitchInArr[j] - 10;

			    			var kmax = pitchInArr[k] +10;
			    			var kmin = pitchInArr[k] - 10;
						    //remove elemnts from array that are not pure tones
						    if(pitchInArr[i] >= jmin/2 && pitchInArr <= jmax/2 || pitchInArr[i] >= kmin/2 && pitchInArr[i] <= kmax/2)// || pitchInArr[i] == 130.86053412462908  )
						    //if(inarr.indexOf(lastIndex)
						    {
						    	console.log("Harmonic Alert");
						    	//get the index of the harmonic 
						    	pitchInArr.indexOf([i]);
						    	console.log("Array values of low harmonics = " + pitchInArr[i]);						    	pitchInArr.splice([i], 1);//delete the low harmonics
						    	//delete pitchInArr[i];	
						    	pitchInArr.splice([i], 1);
						    	//console.log("Array values of now " + pitchInArr[i]);
						    	//console.log("Array is now length " + pitchInArr.length);
						    	
						    }

						    //filter.push([i]);//add the new i elements to the filter
						    
						}
						//console.log("FREQUENCY IS NOW " + pitchInArr[i]);
					} 
				}
			//	return filter; 
			//}


            /* Average filter trial 1 using for loops to iterate through and check if the frequency has jumped more
            than the maximum 15hz between semitones for the C4 semitone position. 
            Semi tones change in a non linear way so need to be careful when working out note changes. 
            C4 to C#4 = 15.55Hz
            B4 to C5 = 29.37Hz
            I may need various statements to change the value of the minimum pitch change variable. 

            */
            //var newArray = new Array();
            //selectNoteBoundry(newArray);

            //function selectNoteBoundry(addFirstNote)
            //{
            	// var note1 = [],//a new array to hold the pitches related to note 1
            	//     k = 0;
            	//     n = note.length;
                //console.log("Full Array = " + pitchInArr);
                
	            var boundarySize = 10;
	            var fullArrayLength = pitchInArr.length; 
	         
	            console.log(fullArrayLength);
	            //have for loops start at higher indexes to ignore false initial readings
	            for(var i = 2; i < pitchInArr.length; i ++)
				{
			    	for(var j = 3; j < pitchInArr.length; j ++)
			    	{

			    		// console.log("i + 10 = " + boundofI);
			    		// console.log("j = " + pitchInArr[j]);
			    		var lowerBound = pitchInArr[i] - boundarySize;
			    		var higherBound = pitchInArr[i] + boundarySize;

			    		// console.log("i = " + pitchInArr[i]);
			    		// console.log("j is " + pitchInArr[j]);
		       //          console.log("Lower Bound is " + lowerBound);		
		       //          console.log("Higher Bound is " + higherBound);	


		                if(pitchInArr[j] < lowerBound || pitchInArr[j] > higherBound)
		                {
		                	if(array1 == true){
			                	//console.log("The Array Has Changed here" );//+ pitchInArr[j]);
	                            //get exact index of the possible note change and subtract 1 to
								//give the last index of the note to be added to a new array.
								var noteBoundry = pitchInArr.indexOf([j]-1);
								var newArray = pitchInArr.slice(0, noteBoundry);//gives the start and end of first note 
								console.log("The First Note ARRAY = " + newArray);

								
								 // console.log("New Array Length = " + newArray.length);
	                            //if(pitchInArr.length <= newArray.length +2){
				                  //console.log("The First Note ARRAY = " + newArray);
				                  //window.setTimeout(2000);//set a slight pause 
			                    //}
								//console.log("Full Array = " + pitchInArr.length);
								//console.log("Note 1 length = " + newArray.length);
	                            //console.log("The = " + addFirstNote);
								// while (k < n){
								// 	note1.push(note.slice(k, k += len));
								// }
								
						    } 
                            array1 = false;//set bool to true to stop this printing out anymore. 
                            //console.log(array1);
							//return note1;
						    //console.log("The Note has changed!" + note1);

						}
						

					}
					//return newArray;
				}
				//return addFirstNote;
						
			//}
			 
			  //console.log(newArray.isArray([]));
			  //console.log(newArray.length);
			// console.log("The First Note ARRAY = " + newArray);
  
        
			




		   
	        //console.log("Array Length Now = " + pitchIn.length);
	        //run a loop to check how many elements are now in the array.. ? Bug not allowing more than one element to be seen
			// for (var i = 0; i < pitchIn.length; i ++)
			// {  
			
			//    //add all the notes together to create one long number
			//    //have to parse the input to int or float before they can be edited properly as numbers.  
			//    pitchIn[i] = parseFloat(pitchIn[i], 10);
			//    sumNew += pitchIn[i];//get the total of all current notes and the starting array notes. 
			//    //use the counter i to access any date needed
			//    //update the array numbers in the console to see whats there.
			//    console.log("Pushed Array value  = " + pitchIn[i]);
			//    //counter ++; 
			//    //console.log("Array Length Now = " + pitchIn.length);
			// }
			
			//runningAverage needs to = (sum + new_number) / (total + 1) 
			//var runningAverage = (sum + lastIndex) / (startingTotal +  1);//1 needs to iterate up once for each new note reading. 
			//console.log("RunningAverage Note value = " + runningAverage);
			
			//two methods 1 Add a new number in to the array and take the average of the running total. 
			// or 2: multiply the average of the first few fewquencies and divide by 
			

		/*******************************************************************
		calculate the average note value of each region to give the melody
		********************************************************************/
	    

			var sumOfNotes = 0;
			
			for(var l = 0; l < pitchInArr.length; l ++)
			{
				//add all the notes together to create one long number
				//pitchInArr[i] = (pitchInArr[i], 10);
				sumOfNotes += pitchInArr[l];
				//print out full array of incoming pitches
				//if(pitchInArr.length == 47)
				//{
					//print out the array
					console.log("Array values = " + pitchInArr[l]);
					//reset the array to 0
					//pitchInArr.length = 0;
				//} 
		    }
		    //console.log("Array Length Now = " + pitchInArr.length);
			// //outside the for loop find out the average of the note region
		    var averageOfNoteRegion = sumOfNotes / pitchInArr.length; 
			
		    //console.log("Average Note value = " + averageOfNoteRegion);
		    // console.log("Pitches are now "  + pitchInArr);
       //      console.log("Array is now length " + pitchInArr.length);
      //       console.log("Sum of Notes = " + sumOfNotes);
	    }// close the if statement
		 
    }
}

