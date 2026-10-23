// Closes the Features dropdown and mobile menu on outside click, link click or Escape.
// Turn on the non-blocking font stylesheets (loaded as media=print so they never block rendering).
document.querySelectorAll('link[data-swap]').forEach(function(l){if(l.sheet)l.media='all';else l.addEventListener('load',function(){l.media='all'})});
(function(){var d=document;function c(s){d.querySelectorAll(s).forEach(function(e){e.open=false})}
d.addEventListener('click',function(e){if(!e.target.closest('.dd'))c('.dd[open]');if(e.target.closest('.mnav-panel a,.dd-panel a'))c('.mnav[open],.dd[open]')});
d.addEventListener('keydown',function(e){if(e.key==='Escape'){var o=d.querySelector('.dd[open],.mnav[open]');if(o){o.open=false;o.querySelector('summary').focus()}}})})();
