function finishLoading() {
	$('.all-content, .header h1').css('opacity', '1');
	$('.loading').hide(0);
}

function translate(class1, class2, x, y) {
	$(class1).find(class2).css({
		'-webkit-transform': 'translate(' + x + 'px , ' + y + 'px)',
		'-moz-transform': 'translate(' + x + 'px , ' + y + 'px)',
		'-o-transform': 'translate(' + x + 'px , ' + y + 'px)',
		'-ms-transform': 'translate(' + x + 'px , ' + y + 'px)',
		'transform': 'translate(' + x + 'px , ' + y + 'px)'
	});
}

function translateAndScale(class1, class2, x, y, scale) {
	$(class1).find(class2).css({
		'-webkit-transform': 'translate(' + x + 'px , ' + y + 'px) scale(' + scale + ')',
		'-moz-transform': 'translate(' + x + 'px , ' + y + 'px) scale(' + scale + ')',
		'-o-transform': 'translate(' + x + 'px , ' + y + 'px) scale(' + scale + ')',
		'-ms-transform': 'translate(' + x + 'px , ' + y + 'px) scale(' + scale + ')',
		'transform': 'translate(' + x + 'px , ' + y + 'px) scale(' + scale + ')'
	});
}		
		

$(function  () {

	$(window).load(function(){

		// twitter custom css
		var cssLink = document.createElement("link") 
		cssLink.href = "css/style.css"; 
		cssLink.rel = "stylesheet"; 
		cssLink.type = "text/css"; 
		frames[0].document.body.appendChild(cssLink);

		finishLoading();
	});

	setTimeout(function(){
		finishLoading();
	}, 5000);

	$(window).scroll(function() {

		var ezzanPos = ($(window).scrollTop() - $('.ezzan').offset().top) + 50;
		if ( ezzanPos > -($(window).height()) && ezzanPos < 0 ) {
			translate('.ezzan', '.images .first-img', (-ezzanPos), 0);
			translate('.ezzan', '.images .second-img', (-ezzanPos*1.6), 0);
			translate('.ezzan', '.images .third-img', (-ezzanPos*2), 0);
		} else {
			translate('.ezzan', '.images .first-img, .images .second-img, .images .third-img', 0, 0);
		}

		var boxxPos = ($(window).scrollTop() - $('.boxx').offset().top) + 50;
		if ( boxxPos > -($(window).height()) && boxxPos < 0 ) {
			translate('.boxx', '.images .first-img', 0, -boxxPos);
		} else {
			translate('.boxx', '.images .first-img', 0, 0);
		}

		var kantiniPos = ($(window).scrollTop() - $('.kantini').offset().top) + 50;
		if ( kantiniPos > -($(window).height()) && kantiniPos < 0 ) {
			translateAndScale('.kantini', '.images .first-img', (-kantiniPos)/2, (-kantiniPos)*0.63, (((kantiniPos*2)+1000)/1000) );
		} else {
			translateAndScale('.kantini', '.images .first-img', 0, 0, 1);
		}

		// var whereWeAre = ($(window).scrollTop() - $('.where').offset().top) + $(window).outerHeight(true);
		// if ( whereWeAre > 0 ) {
		// 	$('.where').addClass('selected');
		// }

	});


	// person animates
	$('.who-we-are li span.person').click(function(event) {
		$('.who-we-are li').removeClass().not($(this).parent()).addClass('not-selected');;
		$(this).parent().addClass('selected');
	});
	$('.who-we-are li span.close').click(function(event) {
		$(this).parent('.selected').addClass('back-selected');
		setTimeout(function(){
			$('.who-we-are li').removeClass();
		}, 1900);
	});


	//
	function whereBg() {
		var photo = Math.floor((Math.random() * 6 ) + 1);
		var randomIstPic = "img/content/where/" + photo + ".jpg";
		$('.where.section').css('background-image', 'url(' + randomIstPic + ')');
	};
	whereBg();
	 


});