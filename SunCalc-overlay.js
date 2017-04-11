var SuncalcOverlay = function(map, position, date) {
	this.setMap(map);
	this.update(position, date);
};

SuncalcOverlay.prototype = new google.maps.OverlayView();

$.extend(SuncalcOverlay.prototype, {
	RADIUS: 270,
	PADDING: 10,
	CURVE_TIME_INTERVAL: 1000*60*20,
	
	CIRCLE_ATTRS: 			["#000000", 0.5, 1],
	
	GREY_PATH_ATTRS: 		["#000000", 0.4, 1],
	
	SUNRISE_DIR_ATTRS: 		['#ffd700', 0.9, 6],
	SUNRISE_SECTOR_ATTRS: 	['#ffd700', 0.15],
	
	SUNSET_DIR_ATTRS: 		['#ff4500', 0.6, 6],
	SUNSET_SECTOR_ATTRS: 	['#ff4500', 0.12],
	
	SUNLIGHT_FILL_ATTRS:	['#ffd700', 0.2],
	
	CURRENT_CURVE_ATTRS: 	['#ffa500', 0.7, 4],
	SUN_DIR_ATTRS: 			['#ffa500', 0.9, 7],
	
	EDGE_SUNRISE_DIR_ATTRS: ['#ffd700', 0.9, 1],
	EDGE_SUNSET_DIR_ATTRS: 	['#ff4500', 0.7, 1],

	update: function(position, date) {
		if (this._position != position) {
			this._positionChanged = true;
			this._position = position;
		}
		if (this._date != date) {
			if (this._date && (this._date.getFullYear() == date.getFullYear()) &&
					(this._date.getDate() == date.getDate()) &&
					(this._date.getMonth() == date.getMonth())) {
				this._timeChanged = true;
			} else {
				this._dayChanged = true;
			}
			this._date = date;
		}
		
		if (this._initialized && (this._positionChanged || this._dayChanged || this._timeChanged)) {
			this.draw();
		}
	},
	
	onAdd: function() {
		this._centerX = this._centerY = this.RADIUS + this.PADDING;
		this._width = this._centerX * 2;
		this._height = this._centerY * 2;
		
		this._container = document.createElement('div');
		this._container.style.position = 'absolute';
		
		this._paper = Raphael(this._container, this._width, this._height);
		
		//background circle
		this._circle = this._paper.circle(this._centerX, this._centerY, this.RADIUS);
		this._circle.attr(this._genPathAttrs(this.CIRCLE_ATTRS));
		
		//sunlight area
		this._sunlightFill = this._paper.path().attr(this._genFillAttrs(this.SUNLIGHT_FILL_ATTRS));
		
		//June 21
		this._jun21Curve = this._paper.path().attr(this._genPathAttrs(this.GREY_PATH_ATTRS));
		
		//December 21
		this._dec21Curve = this._paper.path().attr(this._genPathAttrs(this.GREY_PATH_ATTRS));
		
		//sunset/sunrise intervals
		this._sunriseSector = this._paper.path().attr(this._genFillAttrs(this.SUNRISE_SECTOR_ATTRS)).hide();
		this._sunsetSector = this._paper.path().attr(this._genFillAttrs(this.SUNSET_SECTOR_ATTRS)).hide();
		
		//current day
		this._sunriseDir = this._paper.path().attr(this._genPathAttrs(this.SUNRISE_DIR_ATTRS));
		this._sunsetDir = this._paper.path().attr(this._genPathAttrs(this.SUNSET_DIR_ATTRS));
		this._sunDir = this._paper.path().attr(this._genPathAttrs(this.SUN_DIR_ATTRS));
		this._currentCurve = this._paper.path().attr(this._genPathAttrs(this.CURRENT_CURVE_ATTRS));
		
		function bind(fn, obj) {
			return function() {
				return fn.apply(obj, arguments);
			}
		}
		
		this._sunriseDir.hover(bind(this._sunriseSector.show, this._sunriseSector), bind(this._sunriseSector.hide, this._sunriseSector));
		this._sunsetDir.hover(bind(this._sunsetSector.show, this._sunsetSector), bind(this._sunsetSector.hide, this._sunsetSector));
		
		this.getPanes().overlayLayer.appendChild(this._container);
		this._initialized = true;
	},
	
	draw: function() {
		var projection = this.getProjection();
		var pos = projection.fromLatLngToDivPixel(this._position);
		this._container.style.left = (pos.x - this._centerX) + 'px';
		this._container.style.top = (pos.y - this._centerY) + 'px';
		
		if (this._positionChanged) {
			this._drawYearInfo();
			this._drawCurrentDayInfo();
			this._drawCurrentTimeInfo();
		} else if (this._dayChanged) {
			this._drawCurrentDayInfo();
			this._drawCurrentTimeInfo();
		} else if (this._timeChanged) {
			this._drawCurrentTimeInfo();
		}
		this._positionChanged = this._dayChanged = this._timeChanged = false;
	},
	
	onRemove: function() {
		this.getPanes().overlayLayer.removeChild(this._container);
	},
	
	_drawYearInfo: function() {
		var jun21 = this._getLongestDay(),
			jun21di = this._getDayInfo(jun21),
			jun21CurvePath = this._getCurvePathStr(jun21di, jun21);
			
		this._jun21Curve.attr('path', jun21CurvePath);
		
		var dec21 = this._getShortestDay(),
			dec21di = this._getDayInfo(dec21),
			dec21CurvePath = this._getCurvePathStr(dec21di, dec21);
			
		this._dec21Curve.attr('path', dec21CurvePath);
		
		var sunriseSectorPath = this._getSectorPathStr(jun21di.sunrise.start, dec21di.sunrise.start);
		
		var sunlightFillPath = sunriseSectorPath ? this._getSunlightFillPath(jun21CurvePath, dec21CurvePath) : '';
		this._sunlightFill.attr('path', sunlightFillPath);
		
		this._sunriseSector.attr('path', sunriseSectorPath);
		this._sunsetSector.attr('path', this._getSectorPathStr(dec21di.sunset.end, jun21di.sunset.end));
	},
	
	_drawCurrentDayInfo: function() {
		var di = this._getDayInfo(this._date);
		this._sunriseDir.attr('path', this._getPosPathStr(di.sunrise.start));
		this._sunsetDir.attr('path', this._getPosPathStr(di.sunset.end));
		this._currentCurve.attr('path', this._getCurvePathStr(di, this._date));
	},
	
	_drawCurrentTimeInfo: function() {
		this._sunDir.attr('path', this._getPosPathStr(this._date));
	},
	
	_getSunlightFillPath: function(jun21CurvePath, dec21CurvePath) {
		if (!jun21CurvePath || !dec21CurvePath) { return ''; }
	
		var r = this.RADIUS,
			path = dec21CurvePath.concat(['A', r, r, 0, 0, 1]);
		
		for (var start = jun21CurvePath.length - 3, i = start; i >= 0; i-= 3) {
			if (i != start) {
				path.push('L');
			}
			path.push(jun21CurvePath[i+1]);
			path.push(jun21CurvePath[i+2]);
		}
		
		path = path.concat(['A', r, r, 0, 0, 1, path[1], path[2]]);
		return path;
	},
	
	_getSectorPathStr: function(date1, date2) {
		var p1 = this._getSunPosPoint(date1),
			p2 = this._getSunPosPoint(date2),
			r = this.RADIUS;
		if (isNaN(p1.x) || isNaN(p2.x)) { return ''; }
			
		return ['M', this._centerX, this._centerY, 'L', p1.x, p1.y, 'A', r, r, 0, 0, 1, p2.x, p2.y, 'z'];
	},
	
	_getPosPathStr: function(date) {
		var posPoint = this._getSunPosPoint(date);
		if (posPoint.altitude < -0.018) { return ''; }
			
		return ['M', this._centerX, this._centerY, 'L', posPoint.x, posPoint.y];
	},
	
	_getCurvePathStr: function(di, date) {
		var dates = [];
		
		var start = isNaN(di.sunrise.start) ? date : di.sunrise.start,
			end = isNaN(di.sunset.end) ? new Date(date).setDate(date.getDate() + 1) : di.sunset.end;
		
		var date = new Date(start);
		while (date < end) {
			dates.push(new Date(date));
			date.setTime(date.valueOf() + this.CURVE_TIME_INTERVAL);
		}
		
		dates.push(end);

		var path = [],
			belowHorizon = true;
		for (var i = 0, len = dates.length; i < len; i++) {
			var posPoint = this._getSunPosPoint(dates[i]);
			belowHorizon = belowHorizon && (posPoint.altitude < 0);
			path.push(!i ? 'M' : 'L');
			path.push(posPoint.x);
			path.push(posPoint.y);
		}
		if (belowHorizon) { return ''; }
		return path;
	},
	
	_getDayInfo: function(date) {
		return SunCalc.getDayInfo(date, this._position.lat(), this._position.lng());
	},
	
	_getSunPosPoint: function(date) {
		var pos = SunCalc.getSunPosition(date, this._position.lat(), this._position.lng()),
			angle = Math.PI/2 + pos.azimuth;
		return {
			x: this._centerX + this.RADIUS * Math.cos(angle) * Math.cos(pos.altitude),
			y: this._centerY + this.RADIUS * Math.sin(angle) * Math.cos(pos.altitude),
			altitude: pos.altitude
		};
	},
	
	_getShortestDay: function() {
		var date = new Date(this._date);
		date.setMonth(11);
		date.setDate(21);
		return date;
	},
	
	_getLongestDay: function() {
		var date = new Date(this._date);
		date.setMonth(5);
		date.setDate(21);
		return date;
	},
	
	_genPathAttrs: function(arr) {
		return {
			'stroke': arr[0], 
			'stroke-opacity': arr[1],
			'stroke-width': arr[2]
		};
	},
	
	_genFillAttrs: function(arr) {
		return {
			'fill': arr[0], 
			'fill-opacity': arr[1],
			'stroke': 'none'
		};
	}
});
