// An example Parse.js Backbone application based on the todo app by
// [Jérôme Gravel-Niquet](http://jgn.me/). This demo uses Parse to persist
// the todo items and provide user authentication and sessions.

$(function() {

  Parse.$ = jQuery;

  // Initialize Parse with your Parse application javascript keys
  Parse.initialize("N4mE1MUvtjOu2TLwLGGItErVRPoEJqxKIq8swpbB",
                   "jtf04NGm8Kc2XOlnbHy77NBFDgZLOhqB3FiK4zRM");

  var Grocery = Parse.Object.extend("Grocery", {
    defaults: {
      content: "me hongry",
      done: false
    },

    initialize: function() {
      if (!this.get("content")) {
        this.set({"content": this.defaults.content});
      }
    },

    toggle: function() {
      this.save({done: !this.get("done")});
    }
  });

  var AppState = Parse.Object.extend("AppState", {
    defaults: {
      filter: "all"
    }
  });


  var GroceryList = Parse.Collection.extend({

    model: Grocery,

    done: function() {
      return this.filter(function(grocery){ return grocery.get('done'); });
    },

    remaining: function() {
      return this.without.apply(this, this.done());
    },

    nextOrder: function() {
      if (!this.length) return 1;
      return this.last().get('order') + 1;
    },

    comparator: function(grocery) {
      return grocery.get('order');
    }

  });

  var GroceryView = Parse.View.extend({

    tagName:  "li",

    template: _.template($('#item-template').html()),

    events: {
      "click .toggle"               : "toggleDone",
      "dblclick label.todo-content" : "edit",
      "click .grocery-destroy"      : "clear",
      "keypress .edit"              : "updateOnEnter",
      "blur .edit"                  : "close"
    },

    initialize: function() {
      _.bindAll(this, 'render', 'close', 'remove');
      this.model.bind('change', this.render);
      this.model.bind('destroy', this.remove);
    },

    render: function() {
      $(this.el).html(this.template(this.model.toJSON()));
      this.input = this.$('.edit');
      return this;
    },

    toggleDone: function() {
      this.model.toggle();
    },

    edit: function() {
      $(this.el).addClass("editing");
      this.input.focus();
    },

    close: function() {
      this.model.save({content: this.input.val()});
      $(this.el).removeClass("editing");
    },

    updateOnEnter: function(e) {
      if (e.keyCode == 13) this.close();
    },

    clear: function() {
      this.model.destroy();
    }

  });

  var ManageGroceriesView = Parse.View.extend({

    statsTemplate: _.template($('#stats-template').html()),

    events: {
      "keypress #new-todo":  "createOnEnter",
      "click #clear-completed": "clearCompleted",
      "click #toggle-all": "toggleAllComplete",
      "click .log-out": "logOut",
      "click ul#filters a": "selectFilter"
    },

    el: ".content",

    initialize: function() {
      var self = this;

      _.bindAll(this, 'addOne', 'addAll', 'addSome', 'render', 'toggleAllComplete', 'logOut', 'createOnEnter');

      this.$el.html(_.template($("#manage-groceries-template").html()));

      this.input = this.$("#new-grocery");
      this.allCheckbox = this.$("#toggle-all")[0];

      this.groceries = new GroceryList;

      this.groceries.query = new Parse.Query(Grocery);
      this.groceries.query.equalTo("user", Parse.User.current());
        
      this.groceries.bind('add',     this.addOne);
      this.groceries.bind('reset',   this.addAll);
      this.groceries.bind('all',     this.render);

      this.groceries.fetch();

      state.on("change", this.filter, this);
    },

    logOut: function(e) {
      Parse.User.logOut();
      new LogInView();
      this.undelegateEvents();
      delete this;
    },

    render: function() {
      var done = this.groceries.done().length;
      var remaining = this.groceries.remaining().length;

      this.$('#grocery-stats').html(this.statsTemplate({
        total:      this.groceries.length,
        done:       done,
        remaining:  remaining
      }));

      this.delegateEvents();

      this.allCheckbox.checked = !remaining;
    },

    selectFilter: function(e) {
      var el = $(e.target);
      var filterValue = el.attr("id");
      state.set({filter: filterValue});
      Parse.history.navigate(filterValue);
    },

    filter: function() {
      var filterValue = state.get("filter");
      this.$("ul#filters a").removeClass("selected");
      this.$("ul#filters a#" + filterValue).addClass("selected");
      if (filterValue === "all") {
        this.addAll();
      } else if (filterValue === "completed") {
        this.addSome(function(item) { return item.get('done') });
      } else {
        this.addSome(function(item) { return !item.get('done') });
      }
    },

    resetFilters: function() {
      this.$("ul#filters a").removeClass("selected");
      this.$("ul#filters a#all").addClass("selected");
      this.addAll();
    },

    addOne: function(grocery) {
      var view = new GroceryView({model: grocery});
      this.$("#grocery-list").append(view.render().el);
    },

    addAll: function(collection, filter) {
      this.$("#grocery-list").html("");
      this.groceries.each(this.addOne);
    },

    addSome: function(filter) {
      var self = this;
      this.$("#groceries-list").html("");
      this.todos.chain().filter(filter).each(function(item) { self.addOne(item) });
    },

    createOnEnter: function(e) {
      var self = this;
      if (e.keyCode != 13) return;

      this.groceries.create({
        content: this.input.val(),
        order:   this.groceries.nextOrder(),
        done:    false,
        user:    Parse.User.current(),
        ACL:     new Parse.ACL(Parse.User.current())
      });

      this.input.val('');
      this.resetFilters();
    },

    clearCompleted: function() {
      _.each(this.groceries.done(), function(grocery){ todo.destroy(); });
      return false;
    },

    toggleAllComplete: function () {
      var done = this.allCheckbox.checked;
      this.groceries.each(function (grocery) { grocery.save({'done': done}); });
    }
  });

  var LogInView = Parse.View.extend({
    events: {
      "submit form.login-form": "logIn",
      "submit form.signup-form": "signUp"
    },

    el: ".content",
    
    initialize: function() {
      _.bindAll(this, "logIn", "signUp");
      this.render();
    },

    logIn: function(e) {
      var self = this;
      var username = this.$("#login-username").val();
      var password = this.$("#login-password").val();
      
      Parse.User.logIn(username, password, {
        success: function(user) {
          new ManageGroceriesView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".login-form .error").html("Invalid username or password. Please try again.").show();
          this.$(".login-form button").removeAttr("disabled");
        }
      });

      this.$(".login-form button").attr("disabled", "disabled");

      return false;
    },

    signUp: function(e) {
      var self = this;
      var username = this.$("#signup-username").val();
      var password = this.$("#signup-password").val();
      
      Parse.User.signUp(username, password, { ACL: new Parse.ACL() }, {
        success: function(user) {
          new ManageGroceriesView();
          self.undelegateEvents();
          delete self;
        },

        error: function(user, error) {
          self.$(".signup-form .error").html(error.message).show();
          this.$(".signup-form button").removeAttr("disabled");
        }
      });

      this.$(".signup-form button").attr("disabled", "disabled");

      return false;
    },

    render: function() {
      this.$el.html(_.template($("#login-template").html()));
      this.delegateEvents();
    }
  });

  var AppView = Parse.View.extend({
    el: $("#groceryapp"),

    initialize: function() {
      this.render();
    },

    render: function() {
      if (Parse.User.current()) {
        new ManageGroceriesView();
      } else {
        new LogInView();
      }
    }
  });

  var AppRouter = Parse.Router.extend({
    routes: {
      "all": "all",
      "active": "active",
      "completed": "completed"
    },

    initialize: function(options) {
    },

    all: function() {
      state.set({ filter: "all" });
    },

    active: function() {
      state.set({ filter: "active" });
    },

    completed: function() {
      state.set({ filter: "completed" });
    }
  });

  var state = new AppState;

  new AppRouter;
  new AppView;
  Parse.history.start();
});
