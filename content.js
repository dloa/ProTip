window.addEventListener("message", function (event) {
    // We only accept messages from ourselves
    if (event.source != window) {
        return;
    }

    chrome.runtime.sendMessage({
        action: event.data.action,
        bitcoinAddress: event.data.bitcoinAddress,
        url: document.URL,
        title: document.title
     });
}, false);

var port = chrome.runtime.connect();
knownBTCAddress = '' // set global
if(document.URL.match(/http/)){ // only send http or https urls no chrome:// type addresses.

    chrome.runtime.sendMessage({action: 'isBlacklisted', url:document.URL});
    chrome.runtime.sendMessage({action: 'isStarredUser', url:document.URL});

    // ProTip finds addresses in a 2 step in process using 2 different functions.
    // 1) It scans the whole page and wraps all the bitcoin addresses it finds.
    // 2) It loops over all the wrapped bitcoin addresses and chooses the
    //    bitcoin address it is going to put into the database.

    chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
        knownBTCAddress = request.knownBTCAddress // Set global
        // If the URL is not blackedlisted, scan the page.
        if (request.method == 'isBlacklisted' && request.response == false){
            scanText(document.body);
            scanLinks();
            // (1) All found bitcoin addresses found in the links and text are tagged
            // with the green bordered UI.
            // (2) We loop over all tagged elements and check and submit the
            // correctly prioritized found bitcoin address.
            selectPrioritizedBitcoinAddress({knownBTCAddress: request.knownBTCAddress});

        } else if (request.method == 'isStarredUser' && request.response == true){
            starredUser();
        } // else page is blacklisted and no need to scan anything.
    });
}

function knownBTCAddressFoundOnPage(options){
    var firstFoundLink = Array.prototype.slice.call( document.getElementsByClassName('protip-link') );
    var firstFoundText = Array.prototype.slice.call( document.getElementsByClassName('protip-text') );

    var all = firstFoundLink.concat(firstFoundText);

    if(!(all.indexOf(options.knownBTCAddress) < 0)){
        console.log(options.knownBTCAddress + ' knownBTCAddress and found on page ' + all);
        return true;
    }
    return false;
}

function selectPrioritizedBitcoinAddress(options){
  // There may be many BTC addresses on the page. We can only record one address
  // The order of priority is (1) knownBTCAddress > (2) Metatags > (3) Links > (4) Text
  var firstFoundLinkBitcoinAddress = document.getElementsByClassName('protip-link')[0];
  var firstFoundTextBitcoinAddress = document.getElementsByClassName('protip-text')[0];

  var metatag = scanMetatags();
  if ( options && options.knownBTCAddress == metatag){
      // ***Special Case*** If the previously known bitcoin address is in the
      // metatag, display the word 'Meta' instead of the first 4 characters of
      // the known bitcoin addresss.
      // Otherwise people don't think that ProTip is not detecting the bitcoin
      // address in the Metatag on repeat visits to the URL.
      chrome.runtime.sendMessage({
          source: 'metatag',
          action: "putBitcoinAddress",
          bitcoinAddress: metatag,
          title: document.title,
          url: document.URL
      });
  } else if(options && options.knownBTCAddress && knownBTCAddressFoundOnPage(options)) {
      // (1) Highlight known bitcoin address
      // NOTE: The known address must still exist on the present url.
      recordAndHighlightBitcoinAddress(options.knownBTCAddress)
  } else if (metatag){
      // (2) Don't select any bitcoin addresses. Display 'Meta' in ProTip icon.
      chrome.runtime.sendMessage({
          source: 'metatag',
          action: "putBitcoinAddress",
          bitcoinAddress: metatag,
          title: document.title,
          url: document.URL
      });
  } else if (firstFoundLinkBitcoinAddress) {
      // (3) Highlight the first found Link bitcoin address
      recordAndHighlightBitcoinAddress(firstFoundLinkBitcoinAddress.getAttribute('data-protip-btc-address'));
  } else if (firstFoundTextBitcoinAddress) {
      // (4) Highlight the first found Text bitcoin address
      recordAndHighlightBitcoinAddress(firstFoundTextBitcoinAddress.getAttribute('data-protip-btc-address'));
  }
}

function scanLinks() {
    var matchedLinks = [];
    var links = document.links;
    for ( i = 0; i < links.length; i++ ) {

        // The standard for most third party software such as tipping services and wallets.
        // <a href="bitcoin:1ProTip9x3uoqKDJeMQJdQUCQawDLauNiF">foo</a>
        var match = links[i].href.match(/bitcoin:([13][a-km-zA-HJ-NP-Z0-9]{26,33})/i);
        var btcAddress = '';

        if ( match ) {
            btcAddress = match[1];
        } else if ( links[i].text && !match ) { // check "links[i].text" because <area shape="rect" ... href="/150/"> is a link

            // Allow for this type of bitcoin link, the text only contains the BTC Address
            // <a href="https://blockchain.info/address/1B9c5V8Fc89qCKKznWUGh1vAxDh3RstqgC">
            //    1B9c5V8Fc89qCKKznWUGh1vAxDh3RstqgC
            // </a>
            match = links[i].text.trim().match(/(^|\\s)[13][a-km-zA-HJ-NP-Z0-9]{26,33}($|\\s)/i);
            if ( match ) {
                btcAddress = match[0];
            }
        }

        if ( btcAddress && validAddress(btcAddress) ) {
            matchedLinks.push();
            var span = tagElementWithProTipUI(btcAddress, 'protip-link');
            links[i].parentElement.insertBefore(span, links[i]);
            span.appendChild(links[i]);
        }
    }
}

function scanText(target){
    //var regex = new RegExp("(^|\\s)[13][a-km-zA-HJ-NP-Z0-9]{26,33}($|\\s)");
    var regex = new RegExp("(^|\\s)[13][a-km-zA-HJ-NP-Z0-9]{26,33}($|\\s|\W)");
    //var regex = new RegExp(/(^|\\s)[13][a-km-zA-HJ-NP-Z0-9]{26,33}($|\W)/gm);

    //.replace(/(\W)/gm,"");
    matchText(target, regex, function (node, match) {
        if(node.parentNode.parentNode.className.match(/protip/g)){

            return;
        }

        //var words = node.textContent.split(' ');
        //var words = node.textContent.split(/(\r\n|\n|\r|\s)/gm)
        var words = node.textContent.split(/(\r\n|\n|\r|\s|\,|\;|\.)/gm)
        var parent_span = document.createElement("span");
        for ( i = 0; i < words.length; i++ ) {
            //if(words[i].trim() == 'and'){
            //debugger;
            if(validAddress(words[i].trim())){
                var span = tagElementWithProTipUI(words[i], 'protip-text')
                var content_span = document.createElement("span")
                content_span.textContent = words[i];
                span.appendChild(content_span);
                parent_span.appendChild(span);
            } else {
                var span = document.createElement("span");
                span.textContent = words[i] + ' ';
                parent_span.appendChild(span);
            }
        }

        node.parentElement.replaceChild(parent_span, node);
    });
}

var matchText = function(node, regex, callback, excludeElements) {

    excludeElements || (excludeElements = ['script', 'img', 'style', 'iframe', 'canvas', 'a']); // exclude 'a' links search separately

    try {
        var child = node.firstChild;
        do {
            switch (child.nodeType) {
            case 1:
                if (excludeElements.indexOf(child.tagName.toLowerCase()) > -1) {
                    continue;
                }
                // Weird hack, running scanLinks() prior to matchText messes up the reference to child.firstChild
                // Maybe something to do with the moving the newly created elements post loading... Really not sure
                if(child.firstChild && !(excludeElements.indexOf(child.firstChild.nodeName.toLowerCase()) > -1)){ //
                    matchText(child, regex, callback, excludeElements);
                }
                break;
            case 3:
                if(regex.test(child.data)){
                    callback.apply(window, [child]);
                }
                break;
            }
        } while (child = child.nextSibling);
    }
    catch(err) {
        //debugger;
    }

   return;
}

$(function() {

  observeDOM = (function(){
      var MutationObserver = window.MutationObserver || window.WebKitMutationObserver,
          eventListenerSupported = window.addEventListener;

      return function(obj, callback){
          if( MutationObserver ){
              // define a new observer
              obs = new MutationObserver(function(mutations, observer){ // set as global
              //var obs = new MutationObserver(function(mutations, observer){
                  if( mutations[0].addedNodes.length || mutations[0].removedNodes.length ){
                      if(mutations[0].addedNodes.length > 0){
                          observer.disconnect();
                          callback(mutations[0].addedNodes, observer);
                          observer.observe( document.body, { childList: true , subtree:true, attributes: false, characterData: false });
                      }
                  }
              });
              // have the observer observe foo for changes in children
              obs.observe( obj,  { childList:true, subtree:true, attributes: false, characterData: false });
          }
          else if( eventListenerSupported ){
              obj.addEventListener('DOMNodeInserted', callback, false);
              obj.addEventListener('DOMNodeRemoved', callback, false);
          }
      }
  })();

  observeDOM( document.body, function(addedNodes, observer){
      //observer.disconnect();
      for(var i=0;i < addedNodes.length;i++){
        scanText(addedNodes[i]);
        scanLinks();
        // (1) All found bitcoin addresses found in the links and text are tagged
        // with the green bordered UI.
        // (2) We loop over all tagged elements and check and submit the
        // correctly prioritized found bitcoin address.
        selectPrioritizedBitcoinAddress({knownBTCAddress: knownBTCAddress});
        //scanText(addedNodes[i]);
      }
      //observer.observe( document.body, { childList: true , subtree:true, attributes: false, characterData: false });
  });
});

// window.onload = function () {
//
//   observeDOM = (function(){
//       var MutationObserver = window.MutationObserver || window.WebKitMutationObserver,
//           eventListenerSupported = window.addEventListener;
//
//       return function(obj, callback){
//           if( MutationObserver ){
//               // define a new observer
//               obs = new MutationObserver(function(mutations, observer){ // set as global
//               //var obs = new MutationObserver(function(mutations, observer){
//                   if( mutations[0].addedNodes.length || mutations[0].removedNodes.length ){
//                       if(mutations[0].addedNodes.length > 0){
//                           observer.disconnect();
//                           callback(mutations[0].addedNodes, observer);
//                           observer.observe( document.body, { childList: true , subtree:true, attributes: false, characterData: false });
//                       }
//                   }
//               });
//               // have the observer observe foo for changes in children
//               obs.observe( obj,  { childList:true, subtree:true, attributes: false, characterData: false });
//           }
//           else if( eventListenerSupported ){
//               obj.addEventListener('DOMNodeInserted', callback, false);
//               obj.addEventListener('DOMNodeRemoved', callback, false);
//           }
//       }
//   })();
//
//   observeDOM( document.body, function(addedNodes, observer){
//       //observer.disconnect();
//       for(var i=0;i < addedNodes.length;i++){
//           scanText(addedNodes[i]);
//       }
//       //observer.observe( document.body, { childList: true , subtree:true, attributes: false, characterData: false });
//   });
// }


function scanMetatags(){
    //<meta name="microtip" content="1PvxNMqU29vRj8k5EVKsQEEfc84rS1Br3b" data-currency="btc">
    var metatags = document.getElementsByTagName('meta');
    for ( i = 0; i < metatags.length; i++ ) {
        if( metatags[i].name == 'microtip' && validAddress(metatags[i].content) ) {
            return metatags[i].content // only get the first instance of a microtip metatag.
        }
    }
    return false;
}

function tagElementWithProTipUI(match, klass_name){
    if(!klass_name){ // default
        klass_name ='protip'
    }

    var span = document.createElement("span");
    span.style.padding = '0px';
    span.style.borderRadius = '2px';
    span.style.display = 'inline-flex';
    span.className = klass_name;
    //span.id = match;
    span.setAttribute('data-protip-btc-address', match);
    span.style.border = 'solid 1px #7FE56F';

    // Create and add the checkbox.
    var checkbox = document.createElement("input");
    checkbox.type = 'checkbox';
    checkbox.className = 'protip-checkbox';
    checkbox.id = 'protip-checkbox-' + match;
    checkbox.addEventListener("click",
        function () {
            //obs.disconnect();
            if( this.checked ) { // state changed before 'click' is fired
                window.postMessage(
                    {
                        action: "putBitcoinAddress",
                        bitcoinAddress: this.parentElement.getAttribute('data-protip-btc-address')
                    }, "*"
                );
                ensureSingleSelectionOfCheckbox(this.parentElement.getAttribute('data-protip-btc-address'));
            } else {
                window.postMessage(
                    { action: "deleteBitcoinAddress" }, "*"
                );
                this.parentElement.style.backgroundColor = 'transparent';
                var selectedBTCAddress = this.parentElement.getAttribute('data-protip-btc-address');
                els = document.getElementsByClassName('protip-checkbox');
                for ( i = 0; i < els.length; i++ ) {
                    // uncheck all other instances of the same btc address.
                    if ( els[i].parentElement.getAttribute('data-protip-btc-address') == selectedBTCAddress ) {
                        els[i].checked = false;
                        els[i].parentElement.style.border = 'solid 1px #7FE56F';
                        els[i].parentElement.style.backgroundColor = 'transparent';
                    }
                }
            }
            //obs.observe( document.body, { childList:true, subtree:true });
        }, false
    );

    //obs.disconnect();
    span.insertBefore(checkbox, span.firstChild);
    //obs.observe( document.body,  { childList: true, subtree:true, attributes: false, characterData: false });

    return span;
}

function recordAndHighlightBitcoinAddress(btcAddress){
  chrome.runtime.sendMessage({
      action: 'putBitcoinAddress',
      bitcoinAddress: btcAddress,
      title: document.title,
      url: document.URL
  });
  ensureSingleSelectionOfCheckbox(btcAddress);
}

function ensureSingleSelectionOfCheckbox(selectedBTCAddress){
    // Makes the checkboxes act similar to radio buttons.
    //
    // I care alot about UI design, so why break default
    // UI behavior?
    //
    // Only one BTC address can recorded per URL. A
    // one-to-one relationship.
    //
    // User testing revealed that the first found BTC address
    // is almost always the correct BTC address to record.
    //
    // Edge cases in order of priority:
    // #1 Remove a BTC address such that no BTC address is
    //    recorded for the URL.
    // #2 Swap the recorded BTC address for a another found
    //    further down the page. Rare, but users want to know
    //    they have the option.
    //
    // Typically, this would be done with a combination of
    // checkbox and radio buttons.
    //
    // My reasons for breaking default checkbox UI behavour:
    // #1 Limited UI real estate in unconventional places.
    // #2 The radio buttons work best when promixal to each
    //    other. The highlighted BTC addresses are potentially
    //    distributed throughout the whole page.
    // #3 Edge Case #1 takes priority over Edge Case #2
    //
    // Will see how user testing proceeds. :).
    var els = document.getElementsByClassName('protip-checkbox');
    for ( i = 0; i < els.length; i++ ) {
        if ( els[i].parentElement.getAttribute('data-protip-btc-address') == selectedBTCAddress ) {
            els[i].checked = true;
            els[i].parentElement.style.backgroundColor = '#7FE56F';
        } else {
            els[i].checked = false;
            els[i].parentElement.style.border = 'solid 1px #7FE56F';
            els[i].parentElement.style.backgroundColor = 'transparent';
        }
    }
}

function starredUser(){
    var twitterUserContainer = document.getElementsByClassName('ProfileHeaderCard-name')[0];
    var span = document.createElement("span");
    span.style.backgroundColor = '#7FE56F';

    //Code for displaying <extensionDir>/images/myimage.png:
    var imgURL = chrome.extension.getURL("assets/images/star.png");
    var img = document.createElement("img");
    img.setAttribute("src", imgURL);

    span.style.padding = '5px';
    span.style.marginLeft = '6px';
    span.style.position = 'relative';
    span.style.fontSize = '10px';
    span.style.top = '-3px';
    span.style.borderRadius = '2px';
    span.style.display = 'inline-flex';
    span.innerText = 'ProTip Sponsor';

    twitterUserContainer.appendChild(img);
    twitterUserContainer.appendChild(span);
}

if (location.hostname === "alexandria.io") {
    var alexandria_action = '';
    var alexandria_min_price = 0;
    var alexandria_sug_price = 0;

    var alexandria_address = document.getElementsByClassName('pwyw-btc-address')[0];
    var alexandria_play_price = document.getElementsByClassName('pwyw-btc-play-price')[0];
    var alexandria_download_price = document.getElementsByClassName('pwyw-btc-download-price')[0];

    var countdown_interval;
    var countdown_box;

    function initClicks() {
        var elements = document.querySelectorAll(".pwyw-item, .playlist td");

        for (var i = 0; i < elements.length; i++) {
            elements[i].addEventListener('click', onClickPay);
        }
    }

    $(document).ready(initClicks);

    function onClickPay(e) {
        var self = e.target;
        if ($(self).hasClass('disabled')) return false;
        var	fileData = $(document.querySelector(".playlist tr.active")).data();

        // Check if we are the play or download button
        if ($(self).closest('td').hasClass('tb-price-download') || $(self).closest('li').hasClass('pwyw-action-download') || $(self).closest('tbody').hasClass('playlist-extra-files')) {
            alexandria_action = 'download';
            alexandria_min_price = fileData.minBuy ? fileData.minBuy : 0;
            alexandria_sug_price = fileData.sugBuy ? fileData.sugBuy : 0;
        } else {
            alexandria_action = 'play';
            alexandria_min_price = fileData.minPlay ? fileData.minPlay : 0;
            alexandria_sug_price = fileData.sugPlay ? fileData.sugPlay : 0;
		}

        if (!fileData.length) {
            var price_element = document.querySelector('.playlist tr.active .tb-price-' + alexandria_action + ' .price');
            alexandria_sug_price = price_element !== null && price_element.innerHTML.toLowerCase().indexOf("free") === -1 ? price_element.innerHTML : 0;
        }
        
        console.log(fileData, alexandria_sug_price);

        // Do we have to pay anything?
        // if (alexandria_min_price === 0 || alexandria_min_price === undefined || alexandria_min_price == NaN) return;
        if (alexandria_sug_price === 0 || alexandria_sug_price === undefined || alexandria_sug_price == NaN) return;

        // Prepare wallet and start countdown
        chrome.runtime.sendMessage({ action: 'restoreAddress' });
        displayCountdown();
        countdown_interval = setInterval(displayCountdown, 1000);
    };

    function displayCountdown() {
        if (countdown_box) {
            var seconds = document.getElementById('protip-countdown-seconds').innerHTML;

            if (seconds == 0) {
                var amount = alexandria_action === 'download' ? alexandria_download_price.innerHTML : alexandria_play_price.innerHTML;
                if (alexandria_address.innerHTML && amount) {
                    clearInterval(countdown_interval);
                    countdown_box.parentNode.removeChild(countdown_box);
                    countdown_box = false;
                    chrome.runtime.sendMessage({ action: 'alexandriaSend', address: alexandria_address.innerHTML, amount: amount }, function(response) {
                        if (response && response.error) alert(response.error);
                    });
                }
            } else {
              document.getElementById('protip-countdown-seconds').innerHTML = isNaN(seconds) ? 0 : seconds - 1;
              var i = seconds - 1;
              if (i == 0) {
                $('#protip-countdown-seconds').css('font-size', '15px');
                $('#protip-countdown-seconds').text('sending...');
                $('#circle').css('stroke', '#6fdb6f');
                $('#circle').css('stroke-dashoffset', 0);
                return;
              }
              //$('h2').text(i);
              // If there are 3 or less seconds less, turn the svg color red
              if (i <= 6 && i > 3){
                $('#circle').css('stroke', '#FF9800');
              }
              // If there are 3 or less seconds less, turn the svg color red
              if (i <= 3){
                $('#circle').css('stroke', '#FF0000');
              }
              $('#circle').css('stroke-dashoffset', 440-(seconds-1)*(440/10));
            }
        } else {
            addCountdownBox(alexandria_sug_price, function(box, cancel) {
                countdown_box = box;
                cancel.addEventListener("click", function() {
                    clearInterval(countdown_interval);
                    countdown_box.parentNode.removeChild(countdown_box);
                    countdown_box = false;
                });
            });
        }
    }
} else if (location.hostname === "www.facebook.com") {
    function initPaidFBEmbeds() {
        $('a .fbStoryAttachmentImage').each(function(index, element) {
            var anchor = $(element).closest('a')[0];
            if ($(anchor).data("alexandria-checked")) return;
            $(anchor).data("alexandria-checked", true);
            var link = anchor.href.indexOf("//l.facebook.com/l.php?u=") > -1 ? anchor.href.substring(anchor.href.indexOf("?u=") + 3, anchor.href.indexOf("&") > -1 ? anchor.href.indexOf("&") : undefined) : anchor.href;
            link = decodeURIComponent(link);
            console.log(link);
            if (link.indexOf("https://alexandria.io/browser/") > -1) {
                // Add play button
                element.insertAdjacentHTML('beforeend', '<style>\
    .h72kvmsojg601yi3 {\
        background-image: url(' + chrome.extension.getURL("assets/images/play.png") + ');\
        background-repeat: no-repeat;\
        background-size: auto;\
        background-position: 0 0;\
        cursor: pointer;\
        height: 72px;\
        left: 50%;\
        margin: -39px 0 0 -39px;\
        position: absolute;\
        top: 50%;\
        width: 72px;\
    }\
    a:hover .h72kvmsojg601yi3 {\
        background-position: 0 -73px;\
    }\
</style>\
<i class="h72kvmsojg601yi3"></i>');

                // Get identifier and set click listener
                var identifier = link.substring(30);
                anchor.addEventListener("click", function(e) {
                    e.preventDefault();

                    // Set element which innerHTML is replaced
                    social_stuff_element = $(element).closest('[data-ft]')[0];

                    // Prepare wallet and start countdown
                    chrome.runtime.sendMessage({ action: 'restoreAddress' });
                    socialDisplayCountdown();
                    social_countdown_interval = setInterval(socialDisplayCountdown, 1000);

                    // Get USD rate
                    getUSDdayAvg();

                    // Get media info
                    $.post("https://api.alexandria.io/alexandria/v2/search", '{"protocol":"media","search-on":"txid","search-for":"' + identifier + '","search-like": true}', function(data) {
                        data = JSON.parse(data).response[0]["media-data"];
                        if (!data) {
                          console.error("OIP not supported.");
                          return;
                        }
                        var media = data['alexandria-media'];
                        var info = media.info;
                        var xinfo = info['extra-info'];
                        var payment = media.payment;
                        var ipfsAddr = xinfo['DHT Hash'];
                        var tracks = fixDataMess(xinfo);

                        // This sets a global mainFile object to the main object.
                        if (!xinfo['files']) {
                            xinfo['files'] = [];
                            var i = 0;
                            tracks.forEach( function (file) {
                                xinfo['files'][i] = {
                                    fname: file,
                                    runtime: xinfo['runtime'],
                                    minBuy: 0,
                                    sugBuy: 0,
                                    minPlay: 0,
                                    sugPlay: 0,
                                }
                                if (payment) {
                                    xinfo['files'][i]['type'] = payment['type'];
                                    console.log('Artifact uses old payment format');
                                }
                                if (xinfo['pwyw']) {
                                    var pwywArray = xinfo['pwyw'].split(',');
                                    xinfo['files'][i]['sugBuy'] = parseFloat(pwywArray[0]);
                                    xinfo['files'][i]['sugPlay'] = parseFloat(pwywArray[1]);
                                    xinfo['files'][i]['minBuy'] = parseFloat(pwywArray[1]);
                                } else {
                                    xinfo['files'][i]['sugBuy'] = 0;
                                    xinfo['files'][i]['sugPlay'] =  0;
                                    xinfo['files'][i]['minBuy'] =  0;
                                }
                                i++
                            });
                        }
                        mainFile = {
                            track: xinfo['files'][0],
                            name: xinfo['files'][0].dname,
                            url: IPFSUrl([xinfo['DHT Hash'], xinfo['files'][0].fname]),
                            sugPlay: xinfo['files'][0].sugPlay,
                            minPlay: xinfo['files'][0].minPlay,
                            sugBuy: xinfo['files'][0].sugBuy,
                            minBuy: xinfo['files'][0].minBuy
                        };
                        social_filetype = mainFile.track.fname.split('.')[mainFile.track.fname.split('.').length - 1].toLowerCase();
                        console.info(social_filetype);

                        // Setup play button if we can play it
                        if (!xinfo['files'][0].disallowPlay && xinfo['files'][0].sugPlay) {
                            if (xinfo['Bitcoin Address']) {
                                social_bitcoin_address = xinfo['Bitcoin Address'];
                                setFacebookPlayInfo(xinfo['files'][0], xinfo, media['type']);
                            } else {
                                getTradeBotBitcoinAddress(media.publisher, function(data) {
                                    social_bitcoin_address = data;
                                    setFacebookPlayInfo(xinfo['files'][0], xinfo, media['type']);
                                });
                            }
                        }
                    });
                });
            }
        });
    }

    $(document).ready(initPaidFBEmbeds);
    setInterval(initPaidFBEmbeds, 1000);

} else if (location.hostname === "twitter.com") {
  console.log("Initializing twitter for social embeds");

  function initPaidTwitterEmbeds() {
    console.log("Checking twitter embeds");
    $('iframe').each(function (frame_index, frame_element) {
      $(frame_element.contentDocument.documentElement).find('.SummaryCard-destination').each(function (index, element) {
        console.log("Found card.");
        if (element.innerText !== 'alexandria.io') {
          return;
        }
        console.log("Looks like we're an Alexandria share.");

        var anchor = $(element).closest('a')[0];
        if ($(anchor).data("alexandria-checked")) return;
        $(anchor).data("alexandria-checked", true);
        var tco = anchor.href;
        console.log(tco);

        var dummydiv = $("<div/>")[0];
        $(dummydiv).load(tco, function () {
          var title = $(dummydiv).find('title')[0].innerText;

          if (title.indexOf("https://alexandria.io/browser/") > -1) {
            // Add play button
            element.insertAdjacentHTML('beforeend', '<style>\
    .h72kvmsojg601yi3 {\
        background-image: url(' + chrome.extension.getURL("assets/images/play.png") + ');\
        background-repeat: no-repeat;\
        background-size: auto;\
        background-position: 0 0;\
        cursor: pointer;\
        height: 72px;\
        left: 50%;\
        margin: -39px 0 0 -39px;\
        position: absolute;\
        top: 50%;\
        width: 72px;\
    }\
    a:hover .h72kvmsojg601yi3 {\
        background-position: 0 -73px;\
    }\
</style>\
<i class="h72kvmsojg601yi3"></i>');

            // Get identifier and set click listener
            var identifier = title.substring(30);
            social_artifact_id = identifier;
            anchor.addEventListener("click", function (e) {
              e.preventDefault();

              // Set element which innerHTML is replaced
              social_stuff_element = anchor.parentNode; // $(anchor).find('.SummaryCard-image')[0];

              // Prepare wallet and start countdown
              chrome.runtime.sendMessage({action: 'restoreAddress'});
              socialDisplayCountdown();
              social_countdown_interval = setInterval(socialDisplayCountdown, 1000);

              // Get USD rate
              getUSDdayAvg();

              // Get media info
              $.post("https://api.alexandria.io/alexandria/v2/search", '{"protocol":"media","search-on":"txid","search-for":"' + identifier + '","search-like": true}', function (data) {
                data = JSON.parse(data).response[0]["media-data"];
                if (!data) {
                  console.error("OIP not supported.");
                  return;
                }
                var media = data['alexandria-media'];
                var info = media.info;
                var xinfo = info['extra-info'];
                var payment = media.payment;
                var ipfsAddr = xinfo['DHT Hash'];
                var tracks = fixDataMess(xinfo);

                // This sets a global mainFile object to the main object.
                if (!xinfo['files']) {
                  xinfo['files'] = [];
                  var i = 0;
                  tracks.forEach(function (file) {
                    xinfo['files'][i] = {
                      fname: file,
                      runtime: xinfo['runtime'],
                      minBuy: 0,
                      sugBuy: 0,
                      minPlay: 0,
                      sugPlay: 0,
                    }
                    if (payment) {
                      xinfo['files'][i]['type'] = payment['type'];
                      console.log('Artifact uses old payment format');
                    }
                    if (xinfo['pwyw']) {
                      var pwywArray = xinfo['pwyw'].split(',');
                      xinfo['files'][i]['sugBuy'] = parseFloat(pwywArray[0]);
                      xinfo['files'][i]['sugPlay'] = parseFloat(pwywArray[1]);
                      xinfo['files'][i]['minBuy'] = parseFloat(pwywArray[1]);
                    } else {
                      xinfo['files'][i]['sugBuy'] = 0;
                      xinfo['files'][i]['sugPlay'] = 0;
                      xinfo['files'][i]['minBuy'] = 0;
                    }
                    i++
                  });
                }
                mainFile = {
                  track: xinfo['files'][0],
                  name: xinfo['files'][0].dname,
                  url: IPFSUrl([xinfo['DHT Hash'], xinfo['files'][0].fname]),
                  sugPlay: xinfo['files'][0].sugPlay,
                  minPlay: xinfo['files'][0].minPlay,
                  sugBuy: xinfo['files'][0].sugBuy,
                  minBuy: xinfo['files'][0].minBuy
                };
                social_filetype = mainFile.track.fname.split('.')[mainFile.track.fname.split('.').length - 1].toLowerCase();
                console.info(social_filetype);

                // Setup play button if we can play it
                if (!xinfo['files'][0].disallowPlay && xinfo['files'][0].sugPlay) {
                  if (xinfo['Bitcoin Address']) {
                    social_bitcoin_address = xinfo['Bitcoin Address'];
                    setTwitterPlayInfo(xinfo['files'][0], xinfo, media['type']);
                  } else {
                    getTradeBotBitcoinAddress(media.publisher, function (data) {
                      social_bitcoin_address = data;
                      setTwitterPlayInfo(xinfo['files'][0], xinfo, media['type']);
                    });
                  }
                }
              });
            });
          }
        });
      });
    });
  }

  $(document).ready(initPaidTwitterEmbeds);
  //setInterval(initPaidTwitterEmbeds, 1000);
}

var social_day_avg;
var social_file_data;
var social_bitcoin_address;
var social_payment_address;
var social_amount;
var social_stuff_element;
var social_filetype;
var social_artifact_id;
var social_countdown_interval;
var social_countdown_box;

function addCountdownBox(price, callback) {
//     chrome.runtime.sendMessage({action: "getAlexandriaAutopayCountdown"}, function(response) {
//         document.body.insertAdjacentHTML('beforeend', '<div id="protip-countdown-box" style="\
//     border-radius: 15px;\
//     -webkit-box-shadow: 0px 0px 20px 0px rgba(0,0,0,0.5);\
//     -moz-box-shadow: 0px 0px 20px 0px rgba(0,0,0,0.5);\
//     box-shadow: 0px 0px 10px 0px rgba(0,0,0,0.5);\
//     position: fixed;\
//     right: 20px;\
//     top: 20px;\
//     z-index: 2147483647;\
//     background-color: rgba(255,255,255,0.8);\
//     border: 1px solid #333;\
//     width: 320px;\
//     font-family: \'Roboto\', sans-serif;\
//     font-weight: 100;\
//     "><link href="https://fonts.googleapis.com/css?family=Roboto:100,400i,900" rel="stylesheet"><div style="\
//     padding: 15px 20px 15px 15px;\
// "><div style="\
//     font-size: 45px;\
//     line-height: 50px;\
//     float: right;\
//     text-align: right;\
// ">sending<br><span id="protip-countdown-usd" style="\
//     font-weight: 400;\
//     font-style: italic;\
// ">$' + price + '</span></div><div id="protip-countdown-seconds" style="\
//     font-size: 120px;\
//     line-height: 100px;\
//     letter-spacing: -15px;\
// ">' + response.countdown + '</div></div><div id="protip-countdown-cancel" style="\
//     font-size: 80px;\
//     font-weight: 900;\
//     color: rgba(0,0,0,0.5);\
//     background-color: rgba(0,0,0,0.2);\
//     text-align: center;\
//     line-height: 100px;\
//     border-bottom-left-radius: 15px;\
//     border-bottom-right-radius: 15px;\
//     cursor: pointer;\
// ">Cancel</div></div>');
//         callback(document.getElementById('protip-countdown-box'), document.getElementById('protip-countdown-cancel'));
//     });

  chrome.runtime.sendMessage({action: "getAlexandriaAutopayCountdown"}, function(response) {
    document.body.insertAdjacentHTML('beforeend', '\
      <div id="protip-countdown-box" style="z-index: 2147483647;margin:0; padding:0;line-height: 1;font-family: OpenSans; position: fixed; right: 20px; top: 20px;display:block;opacity:0.85;background-color:#F7F6F5;box-shadow:0 0 32px 0 rgba(0,0,0,0.19);border-radius:11.5px;color:#f7f6f5;width:371px;height:350px;text-align: center">\
  	  <div style="color: #000; padding-top: 1px"><p style="font-size: 25px; color: gray">sending <strong id="protip-countdown-usd" style="color: black">$' + price + '</strong> to</p></div>\
     	<div style="color: #000"><p style="font-size: 25px; color: gray; margin-top: -15px;">The Biddy Bums</p></div>\
        <div class="item" style="padding-right: 30%; padding-left: 30%;position: relative; float: left;">\
          <h2 id="protip-countdown-seconds" style="text-align:center; position: absolute; margin-top: 20px; line-height: 125px; font-size: 50px; width: 160px; color: #000;">' + response.countdown + '</h2>\
          <svg width="160" height="160" xmlns="http://www.w3.org/2000/svg" style="-webkit-transform: rotate(-90deg); transform: rotate(-90deg);">\
            <g>\
              <title>l1</title>\
              <circle id="circle" stroke-dasharray="440" stroke-dashoffset="440" r="69.85699" cy="81" cx="81" stroke-width="8" stroke="#6fdb6f" fill="none"/>\
            </g>\
          </svg>\
        </div>\
        <div style="margin-top: 10px">\
          <button id="protip-countdown-cancel" style="border: none;outline: none;width: 200px;margin-top: 10px;background: #CA0018; border-radius: 4.6px; margin-left: auto; margin-right: auto;" onmouseover="this.style.background = \'#940213\'; this.style.cursor = \'pointer\';" onmouseleave="this.style.background = \'#CA0018\'; this.style.cursor = \'inherit\';"><span style="font-family: OpenSans;font-size: 18px;color: #FFFFFF;margin-top: 10px;height:40px;line-height: 40px;text-align: center">Cancel Payment</span></button>\
        </div>\
      </div>');
    $('#circle').css('stroke-dashoffset', 0);
    $('#circle').css('transition', 'all 1s linear');
    callback(document.getElementById('protip-countdown-box'), document.getElementById('protip-countdown-cancel'));
  });
}

function facebookLoadTrack(name, url, fname) {
  console.log(name, url, fname, social_stuff_element);
  var filetype = social_filetype;
  fname = encodeURI(fname).replace('+', '%20');
  console.info(url + fname);
  var posterurl = url;

  if (fname == 'none') {
    social_stuff_element.innerHTML = '<video controls="controls" autoplay width="100%"><source src="'+ url.slice(0,-1) + '" /></video>';
    return false;
  }

  if ( (filetype == 'webm')  || (filetype == 'mp4') || (filetype == 'ogv') ) {
    social_stuff_element.innerHTML = '<video controls="controls" autoplay width="100%"><source src="'+ url + fname +'" /></video>';
  } else {
    social_stuff_element.innerHTML = '<audio controls="controls" autoplay><source src="'+ url + fname +'" /></audio>';
  }
}

function twitterLoadTrack(name, url, fname) {
  console.log(name, url, fname, social_stuff_element);
  var filetype = social_filetype;
  fname = encodeURI(fname).replace('+', '%20');
  console.info(url + fname);
  var posterurl = url;
  var src = url + fname;

  if (fname == 'none') {
    social_stuff_element.innerHTML = '<video controls="controls" autoplay width="100%"></video>';
    src = url.slice(0,-1);
  } else if ( (filetype == 'webm')  || (filetype == 'mp4') || (filetype == 'ogv') ) {
    social_stuff_element.innerHTML = '<video controls="controls" autoplay width="100%"></video>';
  } else {
    social_stuff_element.innerHTML = '<audio controls="controls" autoplay></audio>';
  }

  var oReq = new XMLHttpRequest();
  oReq.open("GET", src, true);
  oReq.responseType = "blob";

  oReq.onload = function(oEvent) {
    var blob = oReq.response;
    console.log(blob)
    social_stuff_element.children[0].src = URL.createObjectURL(blob)
  };

  oReq.send();

  // social_stuff_element.innerHTML = '<iframe data-src="https://alexandria.io/browser/player/' + social_artifact_id + '" frameborder="0" scrolling="no" allowtransparency="true" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts" src="https://alexandria.io/browser/player/' + social_artifact_id + '?autoplay=1&amp;auto_play=true"></iframe>';
}

function IPFSUrl (components) {
  var IPFSHost = 'https://ipfs.alexandria.io';
  return encodeURI (IPFSHost + '/ipfs/' + components.join ('/'));
}

function fixDataMess(data) {
  var ret = [];
  var i = 2;
  var j = 'filename';

  while (data.hasOwnProperty(j)) {
    ret.push(data[j]);
    j = 'track' + formatInt (i++, 2);
  }

  return ret;
}

function formatInt(num, length) {
  var r = "" + num;
  while (r.length < length) {
    r = "0" + r;
  }
  return r;
}

function getTradeBotBitcoinAddress(floaddress, callback){
  var tradebotURL = 'https://api.alexandria.io/tradebot';
  $.get(tradebotURL+"/depositaddress?floaddress=" + floaddress + '&raw', function(data){
    callback(data.responseText);
  })
}

function socialDisplayCountdown() {
  if (social_countdown_box) {
    var seconds = document.getElementById('protip-countdown-seconds').innerHTML;

    if (seconds == 0) {
      if (social_amount && social_payment_address) {
        clearInterval(social_countdown_interval);
        social_countdown_box.parentNode.removeChild(social_countdown_box);
        social_countdown_box = false;
        chrome.runtime.sendMessage({ action: 'alexandriaSend', address: social_payment_address, amount: social_amount }, function(response) {
          response && response.error ? alert(response.error) : onPaymentDone(social_file_data);
        });
        //onPaymentDone(social_file_data);
      }
    } else {
      document.getElementById('protip-countdown-seconds').innerHTML = isNaN(seconds) ? 0 : seconds - 1;
      var i = seconds - 1;
      if (i == 0) {
        $('#protip-countdown-seconds').css('font-size', '15px');
        $('#protip-countdown-seconds').text('sending...');
        $('#circle').css('stroke', '#6fdb6f');
        $('#circle').css('stroke-dashoffset', 0);
        return;
      }
      //$('h2').text(i);
      // If there are 3 or less seconds less, turn the svg color red
      if (i <= 6 && i > 3){
        $('#circle').css('stroke', '#FF9800');
      }
      // If there are 3 or less seconds less, turn the svg color red
      if (i <= 3){
        $('#circle').css('stroke', '#FF0000');
      }
      $('#circle').css('stroke-dashoffset', 440-(seconds-1)*(440/10));
    }
  } else {
    addCountdownBox("...", function(box, cancel) {
      social_countdown_box = box;
      cancel.addEventListener("click", function() {
        clearInterval(social_countdown_interval);
        social_countdown_box.parentNode.removeChild(social_countdown_box);
        social_countdown_box = false;
      });
    });
  }
}

function getUSDdayAvg() {
  $.ajax({
    url: "https://api.bitcoinaverage.com/ticker/global/USD/"
  }).done(function (usddata) {
    social_day_avg = usddata['24h_avg'];
  });
}

function USDToBTC(amount) {
  return Math.round((Number(amount)/social_day_avg).toString().substring(0, 16)*100000000)/100000000
}

function BTCtoUSD(amount) {
  return Math.round((Number(amount)*social_day_avg).toString().substring(0, 16)*100)/100
}

function makePaymentToAddress(address, minAmt, sugAmt) {
  var URL_RECV = "https://api.alexandria.io/payproc/receive";

  var amountInBTC = USDToBTC(minAmt);
  var params = { address: address, amount: amountInBTC };

  $.ajax({
    url: URL_RECV,
    data: params
  }).done(function (data, textStatus, jqXHR) {
    console.log("Payment address", data.input_address, "Amount:", sugAmt);
    social_payment_address = data.input_address;
    social_amount = USDToBTC(sugAmt);
  });

  return USDToBTC(sugAmt);
}

function setFacebookPlayInfo(file, xinfo, artifactType) {
  if (file.type == artifactType) {
    social_file_data = {track: file, name: name, url: IPFSUrl([xinfo['DHT Hash'], file.fname]), sugPlay: file.sugPlay, minPlay: file.minPlay, sugBuy: file.sugBuy, minBuy: file.minBuy};
    $('#protip-countdown-usd').text("$" + social_file_data.sugPlay);

    // Get payment info
    if (social_file_data.sugPlay && social_bitcoin_address) {
      var amount = social_file_data.sugPlay;
      var btcAddress = social_bitcoin_address;
      var fileData = social_file_data;
      var price = social_file_data.sugPlay;
      var sugPrice = social_file_data.sugPlay;

      function checkForPrice() {
        if (social_day_avg) {
          var btcprice = makePaymentToAddress(btcAddress, price, sugPrice);
        } else {
          setTimeout(checkForPrice, 100);
        }
      }

      checkForPrice();
    }
  }
}

function onPaymentDone(file) {
  var url = file.url;

  console.info(file);

  var trackPath = file.url.slice(0, '-'+ encodeURI(file.track.fname).length);

  if (location.hostname === "twitter.com")
    twitterLoadTrack(file.track.dname, trackPath, file.track.fname);
  else if (location.hostname === "www.facebook.com")
    facebookLoadTrack(file.track.dname, trackPath, file.track.fname);
}


function setTwitterPlayInfo(file, xinfo, artifactType) {
  if (file.type == artifactType) {
    social_file_data = {track: file, name: name, url: IPFSUrl([xinfo['DHT Hash'], file.fname]), sugPlay: file.sugPlay, minPlay: file.minPlay, sugBuy: file.sugBuy, minBuy: file.minBuy};
    $('#protip-countdown-usd').text("$" + social_file_data.sugPlay);

    // Get payment info
    if (social_file_data.sugPlay && social_bitcoin_address) {
      var amount = social_file_data.sugPlay;
      var btcAddress = social_bitcoin_address;
      var fileData = social_file_data;
      var price = social_file_data.sugPlay;
      var sugPrice = social_file_data.sugPlay;

      function checkForPrice() {
        if (social_day_avg) {
          var btcprice = makePaymentToAddress(btcAddress, price, sugPrice);
        } else {
          setTimeout(checkForPrice, 100);
        }
      }

      checkForPrice();
    }
  }
}