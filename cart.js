// ============================================================
// ============================================================
// Butterfly Nectar — shopping cart + Stripe checkout hand-off
// ============================================================
// Cart state lives in localStorage (persists across pages and visits).
// "Checkout" asks the backend (netlify/functions) to create a Stripe Checkout
// session and sends the shopper to Stripe's hosted payment page. The backend
// re-prices everything itself, so nothing in this file decides what gets charged.
// When Stripe sends the shopper back, the site checks with the backend that the
// payment really succeeded before showing the "payment received" pop-up.

(function () {
  "use strict";

  var CART_KEY = "bn_cart";
  // The backend functions are served from the same address as the site (see netlify.toml).
  var CHECKOUT_ENDPOINT = "/api/create-checkout-session";
  var VERIFY_ENDPOINT = "/api/verify-session";
  var MAX_QTY = 20;

  function getCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      /* localStorage unavailable (private mode, etc.) — cart just won't persist */
    }
    renderCart();
  }

  function findProduct(id) {
    return (window.BN_PRODUCTS || []).find(function (p) { return p.id === id; });
  }

  function addToCart(id, qty) {
    qty = qty || 1;
    var cart = getCart();
    var existing = cart.find(function (item) { return item.id === id; });
    if (existing) {
      existing.qty = Math.min(MAX_QTY, existing.qty + qty);
    } else {
      cart.push({ id: id, qty: Math.min(MAX_QTY, qty) });
    }
    saveCart(cart);
    openCart();
  }

  function updateQty(id, qty) {
    var cart = getCart();
    if (qty <= 0) {
      cart = cart.filter(function (item) { return item.id !== id; });
    } else {
      var existing = cart.find(function (item) { return item.id === id; });
      if (existing) existing.qty = qty;
    }
    saveCart(cart);
  }

  function clearCart() {
    saveCart([]);
  }

  function formatMoney(cents) {
    return "$" + (cents / 100).toFixed(2);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderCart() {
    var cart = getCart();
    var countEl = document.getElementById("cart-count");
    var itemsEl = document.getElementById("cart-items");
    var emptyEl = document.getElementById("cart-empty");
    var footerEl = document.getElementById("cart-footer");
    var clearEl = document.getElementById("cart-clear");
    var subtotalEl = document.getElementById("cart-subtotal-amount");
    if (!itemsEl) return; // cart markup isn't on this page

    var totalQty = cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
    if (countEl) {
      countEl.textContent = totalQty;
      countEl.hidden = totalQty === 0;
    }

    if (clearEl) clearEl.hidden = cart.length === 0;

    if (cart.length === 0) {
      itemsEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "flex";
      if (footerEl) footerEl.style.display = "none";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";
    if (footerEl) footerEl.style.display = "block";

    var subtotal = 0;
    var rows = [];
    cart.forEach(function (item) {
      var product = findProduct(item.id);
      if (!product) return;
      var lineTotal = product.price * item.qty;
      subtotal += lineTotal;
      rows.push(
        '<div class="cart-item" data-id="' + escapeHtml(product.id) + '">' +
          '<div class="cart-item-info">' +
            '<span class="cart-item-name">' + escapeHtml(product.name) + "</span>" +
            '<span class="cart-item-price">' + formatMoney(product.price) + "</span>" +
          "</div>" +
          '<div class="cart-item-qty">' +
            '<button class="cart-qty-btn" data-action="decrease" aria-label="Decrease quantity">−</button>' +
            '<span class="cart-qty-value">' + item.qty + "</span>" +
            '<button class="cart-qty-btn" data-action="increase" aria-label="Increase quantity">+</button>' +
          "</div>" +
          '<button class="cart-item-remove" data-action="remove" aria-label="Remove item">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          "</button>" +
        "</div>"
      );
    });
    itemsEl.innerHTML = rows.join("");
    if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
  }

  function openCart() {
    var drawer = document.getElementById("cart-drawer");
    var overlay = document.getElementById("cart-overlay");
    var toggle = document.getElementById("cart-toggle");
    if (!drawer) return;
    drawer.classList.add("open");
    if (overlay) overlay.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  }

  function closeCart() {
    var drawer = document.getElementById("cart-drawer");
    var overlay = document.getElementById("cart-overlay");
    var toggle = document.getElementById("cart-toggle");
    if (!drawer) return;
    drawer.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function checkout() {
    var cart = getCart();
    if (cart.length === 0) return;
    var checkoutBtn = document.getElementById("cart-checkout");
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.textContent = "Redirecting…";
    }
    fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || "Checkout request failed");
          return data;
        });
      })
      .then(function (data) {
        if (data && data.url) {
          window.location.href = data.url;
        } else {
          throw new Error("No checkout URL returned");
        }
      })
      .catch(function (err) {
        console.error(err);
        showNotice("We couldn't start checkout just now. Please try again, or email shopbutterflynectar@gmail.com to order directly.", 12000);
        if (checkoutBtn) {
          checkoutBtn.disabled = false;
          checkoutBtn.textContent = "Checkout";
        }
      });
  }

  var noticeTimer;
  function showNotice(message, ms) {
    var notice = document.getElementById("checkout-notice");
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { notice.hidden = true; }, ms || 9000);
  }

  // ----- centered "payment received" pop-up -----
  var lastFocus = null;
  function openOrderModal(firstName) {
    var modal = document.getElementById("order-modal");
    if (!modal) return;
    var thanks = document.getElementById("order-modal-thanks");
    if (thanks) thanks.textContent = firstName ? "Thank you, " + firstName + "." : "Thank you for your order.";
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    var btn = document.getElementById("order-modal-close");
    if (btn) btn.focus();
  }
  function closeOrderModal() {
    var modal = document.getElementById("order-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // After Stripe sends the shopper back (?checkout=success&session_id=... or ?checkout=cancelled).
  // The pop-up only appears if the backend confirms with Stripe that the payment is "paid".
  function handleCheckoutReturn() {
    var params = new URLSearchParams(window.location.search);
    var status = params.get("checkout");
    if (!status) return;
    var sessionId = params.get("session_id");

    // Tidy the address bar right away so a refresh doesn't repeat this.
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }

    if (status === "cancelled") {
      showNotice("Checkout was cancelled. Your cart is saved whenever you're ready.");
      return;
    }
    if (status !== "success" || !sessionId) return;

    fetch(VERIFY_ENDPOINT + "?session_id=" + encodeURIComponent(sessionId))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.paid) {
          saveCart([]);
          closeCart();
          openOrderModal(data.firstName);
        } else {
          showNotice("We couldn't confirm your payment yet. If you were charged, please email shopbutterflynectar@gmail.com and we'll sort it out.", 15000);
        }
      })
      .catch(function () {
        showNotice("We couldn't confirm your payment just now. If you were charged, please email shopbutterflynectar@gmail.com.", 15000);
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderCart();

    var toggle = document.getElementById("cart-toggle");
    var closeBtn = document.getElementById("cart-close");
    var overlay = document.getElementById("cart-overlay");
    var checkoutBtn = document.getElementById("cart-checkout");
    var itemsEl = document.getElementById("cart-items");

    if (toggle) toggle.addEventListener("click", openCart);
    if (closeBtn) closeBtn.addEventListener("click", closeCart);
    if (overlay) overlay.addEventListener("click", closeCart);
    if (checkoutBtn) checkoutBtn.addEventListener("click", checkout);

    var clearBtn = document.getElementById("cart-clear");
    if (clearBtn) clearBtn.addEventListener("click", clearCart);

    var emptyLink = document.getElementById("cart-empty-link");
    if (emptyLink) emptyLink.addEventListener("click", closeCart);

    handleCheckoutReturn();

    if (itemsEl) {
      itemsEl.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-action]");
        if (!btn) return;
        var row = btn.closest(".cart-item");
        if (!row) return;
        var id = row.getAttribute("data-id");
        var cart = getCart();
        var item = cart.find(function (i) { return i.id === id; });
        if (!item) return;
        if (btn.dataset.action === "increase") updateQty(id, Math.min(MAX_QTY, item.qty + 1));
        if (btn.dataset.action === "decrease") updateQty(id, item.qty - 1);
        if (btn.dataset.action === "remove") updateQty(id, 0);
      });
    }

    // Quantity steppers on the product cards
    function stepperValue(card) {
      return parseInt(card.querySelector(".qty-value").textContent, 10) || 1;
    }
    function setStepper(card, qty) {
      qty = Math.max(1, Math.min(MAX_QTY, qty));
      card.querySelector(".qty-value").textContent = qty;
      card.querySelector('.qty-btn[data-step="-1"]').disabled = qty <= 1;
      card.querySelector('.qty-btn[data-step="1"]').disabled = qty >= MAX_QTY;
    }
    document.querySelectorAll(".product-card").forEach(function (card) {
      setStepper(card, 1);
      card.querySelectorAll(".qty-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          setStepper(card, stepperValue(card) + parseInt(btn.getAttribute("data-step"), 10));
        });
      });
    });

    document.querySelectorAll(".shop-add").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".product-card");
        var qty = card ? stepperValue(card) : 1;
        addToCart(btn.getAttribute("data-id"), qty);
        if (card) setStepper(card, 1);
      });
    });

    // Post-purchase pop-up: close button, backdrop click
    document.querySelectorAll("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", closeOrderModal);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeCart(); closeOrderModal(); }
    });
  });
})();
