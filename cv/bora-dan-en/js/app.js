var app = angular.module('app', []);

app.controller('allControllers', function($scope, $http, $timeout) {

    $http.get("data/cv-datas-en.json")
    .then(function(response) {
        $scope.cvDatas = response.data;
        console.log(response.data);
    }).then(function() {
    	$scope.regexDesc()
    });

		$scope.regexDesc = function() {
			$timeout(function(){
				$('.section .description > span').map(function() {
					console.log($(this).html())
					$(this).html( marked($(this).html()) );
				})
			}, 0, false);
		}

})


