let timer = 1000;
let pin = Math.floor(Math.random() * 10) + 1;
let guess = 0;
let countdown = 10;
let audio = new Audio('explosion.mp3');
let audioCounter = 0;

window.onload = function() {
    var stop = setInterval(function() {
        if (countdown == 0) {
            if (audioCounter == 0) {
                audio.play();
                audioCounter++;
            } else {

            }
            document.querySelector("p").style.display = "none";
            document.querySelector("img").src = "images/bomb-expoded.jpg";
            document.querySelector("h2").style.display = "block";
            document.querySelector("h2").style.color = "red";
            document.querySelector("h2").innerHTML = "You LOST!<br>" +
                "It was " + pin;
            document.querySelector("button").style.backgroundColor = "black";
            document.querySelector("button").style.color = "white";
            document.querySelector("button").innerHTML = "Play again";
        } else if (countdown > 0 && guess == pin) {
            document.querySelector("body").style.backgroundColor = "green";
            document.querySelector("h2").style.display = "block";
            document.querySelector("h2").innerHTML = "You WON!<br>" +
                "It was " + pin;
            clearInterval(stop);
            document.querySelector("button").style.backgroundColor = "black";
            document.querySelector("button").style.color = "white";
            document.querySelector("button").innerHTML = "Play again";
        } else {
            document.querySelector("p").innerHTML = countdown;
            console.log(countdown);
            document.querySelector("img").src = "images/bomb.png";
            countdown--;
        }
    }, timer)
}

document.querySelector('input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        guess = parseInt(document.querySelector("input").value);

        if (guess > pin) {
            document.querySelector("h3").innerHTML = "Smaller";
        } else if (guess < pin) {
            document.querySelector("h3").innerHTML = "Bigger";
        }
        if (document.querySelector("button").innerHTML == "Play again") {
            location.reload();
        }
    }
});

document.querySelector("button").addEventListener("click", function() {
    guess = parseInt(document.querySelector("input").value);

    if (guess > pin) {
        document.querySelector("h3").innerHTML = "Smaller";
    } else if (guess < pin) {
        document.querySelector("h3").innerHTML = "Bigger";
    }
    if (document.querySelector("button").innerHTML == "Play again") {
        location.reload();
    }
})