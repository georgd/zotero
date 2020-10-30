"use strict";

describe("Zotero.Item", function () {
	describe("#getField()", function () {
		it("should return an empty string for valid unset fields on unsaved items", function () {
			var item = new Zotero.Item('book');
			assert.strictEqual(item.getField('rights'), "");
		});
		
		it("should return an empty string for valid unset fields on unsaved items after setting on another field", function () {
			var item = new Zotero.Item('book');
			item.setField('title', 'foo');
			assert.strictEqual(item.getField('rights'), "");
		});
		
		it("should return an empty string for invalid unset fields on unsaved items after setting on another field", function () {
			var item = new Zotero.Item('book');
			item.setField('title', 'foo');
			assert.strictEqual(item.getField('invalid'), "");
		});
		
		it("should return a firstCreator for an unsaved item", function* () {
			var item = createUnsavedDataObject('item');
			item.setCreators([
				{
					firstName: "A",
					lastName: "B",
					creatorType: "author"
				},
				{
					firstName: "C",
					lastName: "D",
					creatorType: "editor"
				}
			]);
			assert.equal(item.getField('firstCreator'), "B");
		});
	});
	
	describe("#setField", function () {
		it("should throw an error if item type isn't set", function () {
			var item = new Zotero.Item;
			assert.throws(() => item.setField('title', 'test'), "Item type must be set before setting field data");
		})
		
		it("should mark a field as changed", function () {
			var item = new Zotero.Item('book');
			item.setField('title', 'Foo');
			assert.isDefined(item._changed.itemData[Zotero.ItemFields.getID('title')]);
			assert.isTrue(item._changed.itemData[Zotero.ItemFields.getID('title')].field);
			assert.isTrue(item.hasChanged());
		})
		
		it("[MULTI] should mark a field and main language as changed", function () {
			var item = new Zotero.Item('book');
			item.setField('title', 'Foo', false, 'en-US', true);
			var fieldID = Zotero.ItemFields.getID('title');
			assert.isDefined(item._changed.itemData[fieldID]);
			assert.isTrue(item._changed.itemData[fieldID].field);
			assert.isTrue(item._changed.itemData[fieldID].mainLang);
			assert.isDefined(item._changed.itemData[fieldID].multiFields);
			assert.isUndefined(item._changed.itemData[fieldID].multiFields['en-US']);
			assert.isTrue(item.hasChanged());
			item.setField('title', 'Bar', false, 'fr-FR', false);
			assert.isTrue(item._changed.itemData[fieldID].multiFields['fr-FR']);
			assert.isTrue(item.hasChanged());
		})
		
		it("[MULTI] should save a field and field variant set separately before save", function* () {
			var item = new Zotero.Item('book');
			item.setField('title', 'Foo', false, 'en-US', true);
			item.setField('title', 'Bar', false, 'fr-FR', false);
			yield item.saveTx();
			assert.equal(item.getField('title'), 'Foo');
			assert.equal(item.getField('title', false, false, 'fr-FR', false), 'Bar');
			assert.equal(item.getField('title', false, false, false, true), 'Foo');

			// Values should be reflected in the DB
			var sql = "SELECT value FROM itemData JOIN itemDataValues USING (valueID) "
				+ "WHERE itemID=? AND fieldID=?";
			var value = yield Zotero.DB.valueQueryAsync(sql, [item.id, Zotero.ItemFields.getID('title')]);
			assert.equal(value, 'Foo');

			var sql = "SELECT value FROM itemDataAlt JOIN itemDataValues USING (valueID) "
				+ "WHERE itemID=? AND fieldID=? AND languageTag=?";
			var value = yield Zotero.DB.valueQueryAsync(sql, [item.id, Zotero.ItemFields.getID('title'), 'fr-FR']);
			assert.equal(value, 'Bar');
		})
		
		it("[MULTI] should save a field and field variant set with separate saves", function* () {
			var item = new Zotero.Item('book');
			item.setField('title', 'Hockey', false, 'en-US', true);
			yield item.saveTx();
			item.setField('title', 'Ping-Pong', false, 'fr-FR', false);
			yield item.saveTx();
			assert.equal(item.getField('title'), 'Hockey');
			assert.equal(item.getField('title', false, false, 'fr-FR', false), 'Ping-Pong');
			assert.equal(item.getField('title', false, false, false, true), 'Hockey');

			// Value should be reflected in the DB
			var sql = "SELECT value FROM itemDataAlt JOIN itemDataValues USING (valueID) "
				+ "WHERE itemID=? AND fieldID=? AND languageTag=?";
			var value = yield Zotero.DB.valueQueryAsync(sql, [item.id, Zotero.ItemFields.getID('title'), 'fr-FR']);
			assert.equal(value, 'Ping-Pong');
		})
		
		it("[MULTI] should edit a field variant after once saving", function* () {
			var item = new Zotero.Item('book');
			item.setField('title', 'Hockey', false, 'en-US', true);
			item.setField('title', 'Ping-Pong', false, 'fr-FR', false);
			yield item.saveTx();
			assert.equal(item.getField('title'), 'Hockey');
			assert.equal(item.getField('title', false, false, 'fr-FR', false), 'Ping-Pong');
			item.setField('title', 'Table Tennis', false, 'fr-FR', false);
			yield item.saveTx();
			assert.equal(item.getField('title', false, false, 'fr-FR', false), 'Table Tennis');

			// Value should be reflected in the DB
			var sql = "SELECT value FROM itemDataAlt JOIN itemDataValues USING (valueID) "
				+ "WHERE itemID=? AND fieldID=? AND languageTag=?";
			var value = yield Zotero.DB.valueQueryAsync(sql, [item.id, Zotero.ItemFields.getID('title'), 'fr-FR']);
			assert.equal(value, 'Table Tennis');
		})
		
		it("should save an integer as a string", function* () {
			var val = 1234;
			var item = new Zotero.Item('book');
			item.setField('numPages', val);
			yield item.saveTx();
			assert.strictEqual(item.getField('numPages'), "" + val);
			// Setting again as string shouldn't register a change
			assert.isFalse(item.setField('numPages', "" + val));
			
			// Value should be TEXT in the DB
			var sql = "SELECT TYPEOF(value) FROM itemData JOIN itemDataValues USING (valueID) "
				+ "WHERE itemID=? AND fieldID=?";
			var type = yield Zotero.DB.valueQueryAsync(sql, [item.id, Zotero.ItemFields.getID('numPages')]);
			assert.equal(type, 'text');
		});
		
		it("should save integer 0 as a string", function* () {
			var val = 0;
			var item = new Zotero.Item('book');
			item.setField('numPages', val);
			yield item.saveTx();
			assert.strictEqual(item.getField('numPages'), "" + val);
			// Setting again as string shouldn't register a change
			assert.isFalse(item.setField('numPages', "" + val));
		});
		
		it('[MULTI] should clear a variant on reload', function* () {
			var field = 'title';
			var val = 'foo';
			var multiVal = 'FEU';
			var langTag = 'fr-FR';
			var fieldID = Zotero.ItemFields.getID(field);
			var item = new Zotero.Item('book');
			item.setField(field, val);
			yield item.saveTx();

			item.setField(field, multiVal, false, langTag);

			yield item.reload();
			assert.isFalse(item.hasChanged());
			assert.equal(item.getField(field), val);
			assert.isUndefined(item.multi._keys[fieldID]);
			assert.equal(item.getField(field, false, false, langTag), val, 'return main val if requested multiVal not set');

			item.setField(field, multiVal, false, langTag);
			assert.isTrue(item.hasChanged());
			yield item.saveTx();

			assert.isFalse(item.hasChanged());
			//assert.isDefined(item.multi._keys[fieldID]);
			//assert.equal(item.multi._keys[fieldID][langTag], multiVal);
			assert.equal(item.getField(field, false, false, langTag), multiVal);

		});

		it('[MULTI] should clear return main val after save if requested variant is not set', function* () {
			var field = 'title';
			var val = 'fooze';
			var langTag = 'fr-FR';
			var fieldID = Zotero.ItemFields.getID(field);
			var item = new Zotero.Item('book');
			item.setField(field, val);
			assert.equal(item.getField(field, false, false, langTag), val);
			yield item.saveTx();

			assert.equal(item.getField(field, false, false, langTag), val);
		});
		
		it('should clear an existing field when ""/null/false is passed', function* () {
			var field = 'title';
			var val = 'foo';
			var fieldID = Zotero.ItemFields.getID(field);
			var item = new Zotero.Item('book');
			item.setField(field, val);
			yield item.saveTx();
			
			item.setField(field, "");
			assert.ok(item._changed.itemData[fieldID].field);
			assert.isTrue(item.hasChanged());
			
			// Reset to original value
			yield item.reload();
			assert.isFalse(item.hasChanged());
			assert.equal(item.getField(field), val);
			
			// false
			item.setField(field, false);
			assert.ok(item._changed.itemData[fieldID].field);
			assert.isTrue(item.hasChanged());
			
			// Reset to original value
			yield item.reload();
			assert.isFalse(item.hasChanged());
			assert.equal(item.getField(field), val);

			// null
			item.setField(field, null);
			assert.ok(item._changed.itemData[fieldID].field);
			assert.isTrue(item.hasChanged());
			
			yield item.saveTx();
			assert.equal(item.getField(field), "");
		})
		
		it('should clear a field set to "0" when a ""/null/false is passed', function* () {
			var field = 'title';
			var val = "0";
			var fieldID = Zotero.ItemFields.getID(field);
			var item = new Zotero.Item('book');
			item.setField(field, val);
			yield item.saveTx();
			
			assert.strictEqual(item.getField(field), val);
			
			// ""
			item.setField(field, "");
			assert.ok(item._changed.itemData[fieldID]);
			assert.isTrue(item.hasChanged());
			
			// Reset to original value
			yield item.reload();
			assert.isFalse(item.hasChanged());
			assert.strictEqual(item.getField(field), val);
			
			// False
			item.setField(field, false);
			assert.ok(item._changed.itemData[fieldID]);
			assert.isTrue(item.hasChanged());
			
			// Reset to original value
			yield item.reload();
			assert.isFalse(item.hasChanged());
			assert.strictEqual(item.getField(field), val);
			
			// null
			item.setField(field, null);
			assert.ok(item._changed.itemData[fieldID]);
			assert.isTrue(item.hasChanged());
			
			yield item.saveTx();
			assert.strictEqual(item.getField(field), "");
		})
		
		it("should throw if value is undefined", function () {
			var item = new Zotero.Item('book');
			assert.throws(() => item.setField('title'), "'title' value cannot be undefined");
		})
		
		it("should not mark an empty field set to an empty string as changed", function () {
			var item = new Zotero.Item('book');
			item.setField('url', '');
			assert.isUndefined(item._changed.itemData);
		})
		
		it("should save version as object version", function* () {
			var item = new Zotero.Item('book');
			item.setField("version", 1);
			var id = yield item.saveTx();
			item = yield Zotero.Items.getAsync(id);
			assert.equal(item.getField("version"), 1);
			assert.equal(item.version, 1);
		});
		
		it("should save versionNumber for computerProgram", function* () {
			var item = new Zotero.Item('computerProgram');
			item.setField("versionNumber", "1.0");
			var id = yield item.saveTx();
			item = yield Zotero.Items.getAsync(id);
			assert.equal(item.getField("versionNumber"), "1.0");
		});
		
		it("should accept ISO 8601 dates", function* () {
			var fields = {
				accessDate: "2015-06-07T20:56:00Z",
				dateAdded: "2015-06-07T20:57:00Z",
				dateModified: "2015-06-07T20:58:00Z",
			};
			var item = createUnsavedDataObject('item');
			for (let i in fields) {
				item.setField(i, fields[i]);
			}
			assert.equal(item.getField('accessDate'), '2015-06-07 20:56:00');
			assert.equal(item.dateAdded, '2015-06-07 20:57:00');
			assert.equal(item.dateModified, '2015-06-07 20:58:00');
		})
		
		it("should accept SQL dates", function* () {
			var fields = {
				accessDate: "2015-06-07 20:56:00",
				dateAdded: "2015-06-07 20:57:00",
				dateModified: "2015-06-07 20:58:00",
			};
			var item = createUnsavedDataObject('item');
			for (let i in fields) {
				item.setField(i, fields[i]);
				item.getField(i, fields[i]);
			}
		})
		
		it("should accept SQL accessDate without time", function* () {
			var item = createUnsavedDataObject('item');
			var date = "2017-04-05";
			item.setField("accessDate", date);
			assert.strictEqual(item.getField('accessDate'), date);
		});
		
		it("should ignore unknown accessDate values", function* () {
			var fields = {
				accessDate: "foo"
			};
			var item = createUnsavedDataObject('item');
			for (let i in fields) {
				item.setField(i, fields[i]);
			}
			assert.strictEqual(item.getField('accessDate'), '');
		})
	})
	
	describe("#dateAdded", function () {
		it("should use current time if value was not given for a new item", function* () {
			var item = new Zotero.Item('book');
			var id = yield item.saveTx();
			item = Zotero.Items.get(id);
			
			assert.closeTo(Zotero.Date.sqlToDate(item.dateAdded, true).getTime(), Date.now(), 2000);
		})
		
		it("should use given value for a new item", function* () {
			var dateAdded = "2015-05-05 17:18:12";
			var item = new Zotero.Item('book');
			item.dateAdded = dateAdded;
			var id = yield item.saveTx();
			item = yield Zotero.Items.getAsync(id);
			assert.equal(item.dateAdded, dateAdded);
		})
	})
	
	describe("#dateModified", function () {
		it("should use given value for a new item", function* () {
			var dateModified = "2015-05-05 17:18:12";
			var item = new Zotero.Item('book');
			item.dateModified = dateModified;
			var id = yield item.saveTx();
			assert.equal(item.dateModified, dateModified);
			item = yield Zotero.Items.getAsync(id);
			assert.equal(item.dateModified, dateModified);
		})
		
		it("should use given value when skipDateModifiedUpdate is set for a new item", function* () {
			var dateModified = "2015-05-05 17:18:12";
			var item = new Zotero.Item('book');
			item.dateModified = dateModified;
			var id = yield item.saveTx({
				skipDateModifiedUpdate: true
			});
			assert.equal(item.dateModified, dateModified);
			item = yield Zotero.Items.getAsync(id);
			assert.equal(item.dateModified, dateModified);
		})
		
		it("should use current time if value was not given for an existing item", function* () {
			var dateModified = "2015-05-05 17:18:12";
			var item = new Zotero.Item('book');
			item.dateModified = dateModified;
			var id = yield item.saveTx();
			item = Zotero.Items.get(id);
			
			// Save again without changing Date Modified
			item.setField('title', 'Test');
			yield item.saveTx()
			
			assert.closeTo(Zotero.Date.sqlToDate(item.dateModified, true).getTime(), Date.now(), 2000);
		})
		
		it("should use current time if the existing value was given for an existing item", function* () {
			var dateModified = "2015-05-05 17:18:12";
			var item = new Zotero.Item('book');
			item.dateModified = dateModified;
			var id = yield item.saveTx();
			item = Zotero.Items.get(id);
			
			// Set Date Modified to existing value
			item.setField('title', 'Test');
			item.dateModified = dateModified;
			yield item.saveTx()
			assert.closeTo(Zotero.Date.sqlToDate(item.dateModified, true).getTime(), Date.now(), 2000);
		})
		
		it("should use current time if value is not given when skipDateModifiedUpdate is set for a new item", function* () {
			var item = new Zotero.Item('book');
			var id = yield item.saveTx({
				skipDateModifiedUpdate: true
			});
			item = yield Zotero.Items.getAsync(id);
			assert.closeTo(Zotero.Date.sqlToDate(item.dateModified, true).getTime(), Date.now(), 2000);
		})
		
		it("should keep original value when skipDateModifiedUpdate is set for an existing item", function* () {
			var dateModified = "2015-05-05 17:18:12";
			var item = new Zotero.Item('book');
			item.dateModified = dateModified;
			var id = yield item.saveTx();
			item = Zotero.Items.get(id);
			
			// Resave with skipDateModifiedUpdate
			item.setField('title', 'Test');
			yield item.saveTx({
				skipDateModifiedUpdate: true
			})
			assert.equal(item.dateModified, dateModified);
		})
	})
	
	describe("#deleted", function () {
		it("should be set to true after save", function* () {
			var item = yield createDataObject('item');
			item.deleted = true;
			// Sanity check for itemsTest#trash()
			assert.isTrue(item._changed.deleted);
			yield item.saveTx();
			assert.ok(item.deleted);
		})
		
		it("should be set to false after save", function* () {
			var collection = yield createDataObject('collection');
			var item = createUnsavedDataObject('item');
			item.deleted = true;
			yield item.saveTx();
			
			item.deleted = false;
			yield item.saveTx();
			assert.isFalse(item.deleted);
		})
	})
	
	describe("#inPublications", function () {
		it("should add item to publications table", function* () {
			var item = yield createDataObject('item');
			item.inPublications = true;
			yield item.saveTx();
			assert.ok(item.inPublications);
			assert.equal(
				(yield Zotero.DB.valueQueryAsync(
					"SELECT COUNT(*) FROM publicationsItems WHERE itemID=?", item.id)),
				1
			);
		})
		
		it("should be set to false after save", function* () {
			var collection = yield createDataObject('collection');
			var item = createUnsavedDataObject('item');
			item.inPublications = false;
			yield item.saveTx();
			
			item.inPublications = false;
			yield item.saveTx();
			assert.isFalse(item.inPublications);
			assert.equal(
				(yield Zotero.DB.valueQueryAsync(
					"SELECT COUNT(*) FROM publicationsItems WHERE itemID=?", item.id)),
				0
			);
		});
		
		it("should be invalid for linked-file attachments", function* () {
			var item = yield createDataObject('item', { inPublications: true });
			var attachment = yield Zotero.Attachments.linkFromFile({
				file: OS.Path.join(getTestDataDirectory().path, 'test.png'),
				parentItemID: item.id
			});
			attachment.inPublications = true;
			var e = yield getPromiseError(attachment.saveTx());
			assert.ok(e);
			assert.include(e.message, "Linked-file attachments cannot be added to My Publications");
		});
		
		it("should be invalid for group library items", function* () {
			var group = yield getGroup();
			var item = yield createDataObject('item', { libraryID: group.libraryID });
			item.inPublications = true;
			var e = yield getPromiseError(item.saveTx());
			assert.ok(e);
			assert.equal(e.message, "Only items in user libraries can be added to My Publications");
		});
	});
	
	describe("#parentID", function () {
		it("should create a child note", function* () {
			var item = new Zotero.Item('book');
			var parentItemID = yield item.saveTx();
			
			item = new Zotero.Item('note');
			item.parentID = parentItemID;
			var childItemID = yield item.saveTx();
			
			item = yield Zotero.Items.getAsync(childItemID);
			assert.ok(item.parentID);
			assert.equal(item.parentID, parentItemID);
		});
		
		it("should not be settable to item itself", async function () {
			var item = await createDataObject('item', { itemType: 'note' });
			item.parentID = item.id;
			var e = await getPromiseError(item.saveTx());
			assert.ok(e);
			assert.equal(e.message, "Item cannot be set as parent of itself");
		});
	});
	
	describe("#parentKey", function () {
		it("should be false for an unsaved attachment", function () {
			var item = new Zotero.Item('attachment');
			assert.isFalse(item.parentKey);
		});
		
		it("should be false on an unsaved non-attachment item", function () {
			var item = new Zotero.Item('book');
			assert.isFalse(item.parentKey);
		});
		
		it("should not be marked as changed setting to false on an unsaved item", function () {
			var item = new Zotero.Item('attachment');
			item.attachmentLinkMode = 'linked_url';
			item.parentKey = false;
			assert.isUndefined(item._changed.parentKey);
		});
		
		it("should not mark item as changed if false and no existing parent", function* () {
			var item = new Zotero.Item('attachment');
			item.attachmentLinkMode = 'linked_url';
			item.url = "https://www.zotero.org/";
			var id = yield item.saveTx();
			item = yield Zotero.Items.getAsync(id);
			
			item.parentKey = false;
			assert.isFalse(item.hasChanged());
		});
		
		it("should not be marked as changed after a save", async function () {
			var item = await createDataObject('item');
			var attachment = new Zotero.Item('attachment');
			attachment.attachmentLinkMode = 'linked_url';
			await attachment.saveTx();
			
			attachment.parentKey = item.key;
			assert.isTrue(attachment._changed.parentKey);
			await attachment.saveTx();
			assert.isUndefined(attachment._changed.parentKey);
		});
		
		it("should move a top-level note under another item", function* () {
			var noteItem = new Zotero.Item('note');
			var id = yield noteItem.saveTx()
			noteItem = yield Zotero.Items.getAsync(id);
			
			var item = new Zotero.Item('book');
			id = yield item.saveTx();
			var { libraryID, key } = Zotero.Items.getLibraryAndKeyFromID(id);
			
			noteItem.parentKey = key;
			yield noteItem.saveTx();
			
			assert.isFalse(noteItem.isTopLevelItem());
		})
		
		it("should remove top-level item from collections when moving it under another item", function* () {
			// Create a collection
			var collection = new Zotero.Collection;
			collection.name = "Test";
			var collectionID = yield collection.saveTx();
			
			// Create a top-level note and add it to a collection
			var noteItem = new Zotero.Item('note');
			noteItem.addToCollection(collectionID);
			var id = yield noteItem.saveTx()
			noteItem = yield Zotero.Items.getAsync(id);
			
			var item = new Zotero.Item('book');
			id = yield item.saveTx();
			var { libraryID, key } = Zotero.Items.getLibraryAndKeyFromID(id);
			noteItem.parentKey = key;
			yield noteItem.saveTx();
			
			assert.isFalse(noteItem.isTopLevelItem());
		})
		
		it("should not be settable to item itself", async function () {
			var item = new Zotero.Item('note');
			item.libraryID = Zotero.Libraries.userLibraryID;
			item.key = Zotero.DataObjectUtilities.generateKey();
			item.parentKey = item.key;
			var e = await getPromiseError(item.saveTx());
			assert.ok(e);
			assert.equal(e.message, "Item cannot be set as parent of itself");
		});
	});
	
	describe("#getCreators()", function () {
		it("[MULTI] should update after creators are removed", function* () {
			var item = createUnsavedDataObject('item');
			item.setCreators([
				{
					creatorType: "author",
					name: "A",
					multi: {
						_key: {}
					}
				}
			]);
			yield item.saveTx();
			
			assert.lengthOf(item.getCreators(), 1);
			
			item.setCreators([]);
			yield item.saveTx();
			
			assert.lengthOf(item.getCreators(), 0);
		});
		
		it("[MULTI] should update after multi creators are removed", function* () {
			var item = createUnsavedDataObject('item');
			item.setCreators([
				{
					creatorType: "author",
					name: "A",
					multi: {
						_key: {
							"fr-FR": {
								name: "Un"
							}
						}
					}
				}
			]);
			yield item.saveTx();
			
			assert.lengthOf(item.getCreators(), 1);
			item.setCreators([
				{
					creatorType: "author",
					name: "A",
					multi: {
						_key: {}
					}
				}
			]);
			yield item.saveTx();
			
			assert.lengthOf(item.getCreators(), 1);
			assert.isUndefined(item.getCreators()[0].multi._key['fr-FR']);
		});
	});
	
	describe("#setCreators", function () {
		it("[MULTI] should accept an array of creators in API JSON format", function* () {
			var creators = [
				{
					firstName: "First",
					lastName: "Last",
					creatorType: "author",
					multi: {
						_key: {}
					}
				},
				{
					name: "Test Name",
					creatorType: "editor",
					multi: {
						_key: {}
					}
				}
			];
			
			var item = new Zotero.Item("journalArticle");
			item.setCreators(creators);
			var id = yield item.saveTx();
			item = Zotero.Items.get(id);
			assert.sameDeepMembers(item.getCreatorsJSON(), creators);
		})
		
		it("[MULTI] should accept an array of creators in internal format", function* () {
			var creators = [
				{
					firstName: "First",
					lastName: "Last",
					fieldMode: 0,
					multi: {
						_key: {}
					},
					creatorTypeID: Zotero.CreatorTypes.getID('author')
				},
				{
					firstName: "",
					lastName: "Test Name",
					fieldMode: 1,
					multi: {
						_key: {}
					},
					creatorTypeID: Zotero.CreatorTypes.getID('editor')
				}
			];
			
			var item = new Zotero.Item("journalArticle");
			item.setCreators(creators);
			var id = yield item.saveTx();
			item = Zotero.Items.get(id);
			assert.sameDeepMembers(item.getCreators(), creators);
		})
		
		it("[MULTI] should clear creators if empty array passed", function () {
			var item = createUnsavedDataObject('item');
			item.setCreators([
				{
					firstName: "First",
					lastName: "Last",
					fieldMode: 0,
					multi: {
						_key: {}
					},
					creatorTypeID: Zotero.CreatorTypes.getID('author')
				}
			]);
			assert.lengthOf(item.getCreators(), 1);
			item.setCreators([]);
			assert.lengthOf(item.getCreators(), 0);
		});
		
		it("should switch to primary creator type if unknown type given", function () {
			var item = createUnsavedDataObject('item', { itemType: 'book' });
			item.setCreators([
				{
					firstName: "First",
					lastName: "Last",
					creatorType: "unknown"
				}
			]);
			assert.equal(item.getCreators()[0].creatorTypeID, Zotero.CreatorTypes.getID('author'));
		});
		
		it("should switch to primary creator type on invalid creator type for a given item type", function () {
			var item = createUnsavedDataObject('item', { itemType: 'book' });
			item.setCreators([
				{
					firstName: "First",
					lastName: "Last",
					creatorType: "interviewee"
				}
			]);
			assert.equal(item.getCreators()[0].creatorTypeID, Zotero.CreatorTypes.getID('author'));
		});
		
		it("should throw on unknown creator type in strict mode", function () {
			var item = createUnsavedDataObject('item', { itemType: 'book' });
			var f = () => {
				item.setCreators(
					[
						{
							firstName: "First",
							lastName: "Last",
							creatorType: "unknown"
						}
					],
					{
						strict: true
					}
				);
			};
			assert.throws(f, /^Unknown creator type/);
		});
		
		it("should throw on invalid creator type for a given item type in strict mode", function () {
			var item = createUnsavedDataObject('item', { itemType: 'book' });
			var f = () => {
				item.setCreators(
					[
						{
							firstName: "First",
							lastName: "Last",
							creatorType: "interviewee"
						}
					],
					{
						strict: true
					}
				);
			}
			assert.throws(f, /^Invalid creator type/);
		});
	})
	
	
	describe("#setCollections()", function () {
		it("should add a collection with an all-numeric key", async function () {
			var col = new Zotero.Collection();
			col.libraryID = Zotero.Libraries.userLibraryID;
			col.key = '23456789';
			await col.loadPrimaryData();
			col.name = 'Test';
			var id = await col.saveTx();
			
			var item = createUnsavedDataObject('item');
			item.setCollections([col.key]);
			await item.saveTx();
			
			assert.isTrue(col.hasItem(item));
		});
	});
	
	
	describe("#numAttachments()", function () {
		it("should include child attachments", function* () {
			var item = yield createDataObject('item');
			var attachment = yield importFileAttachment('test.png', { parentID: item.id });
			assert.equal(item.numAttachments(), 1);
		});
		
		it("shouldn't include trashed child attachments by default", function* () {
			var item = yield createDataObject('item');
			yield importFileAttachment('test.png', { parentID: item.id });
			var attachment = yield importFileAttachment('test.png', { parentID: item.id });
			attachment.deleted = true;
			yield attachment.saveTx();
			assert.equal(item.numAttachments(), 1);
		});
		
		it("should include trashed child attachments if includeTrashed=true", function* () {
			var item = yield createDataObject('item');
			yield importFileAttachment('test.png', { parentID: item.id });
			var attachment = yield importFileAttachment('test.png', { parentID: item.id });
			attachment.deleted = true;
			yield attachment.saveTx();
			assert.equal(item.numAttachments(true), 2);
		});
	});
	
	
	describe("#getAttachments()", function () {
		it("#should return child attachments", function* () {
			var item = yield createDataObject('item');
			var attachment = new Zotero.Item("attachment");
			attachment.parentID = item.id;
			attachment.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
			yield attachment.saveTx();
			
			var attachments = item.getAttachments();
			assert.lengthOf(attachments, 1);
			assert.equal(attachments[0], attachment.id);
		})
		
		it("#should ignore trashed child attachments by default", function* () {
			var item = yield createDataObject('item');
			var attachment = new Zotero.Item("attachment");
			attachment.parentID = item.id;
			attachment.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
			attachment.deleted = true;
			yield attachment.saveTx();
			
			var attachments = item.getAttachments();
			assert.lengthOf(attachments, 0);
		})
		
		it("#should include trashed child attachments if includeTrashed=true", function* () {
			var item = yield createDataObject('item');
			var attachment = new Zotero.Item("attachment");
			attachment.parentID = item.id;
			attachment.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
			attachment.deleted = true;
			yield attachment.saveTx();
			
			var attachments = item.getAttachments(true);
			assert.lengthOf(attachments, 1);
			assert.equal(attachments[0], attachment.id);
		})
		
		it("#should return an empty array for an item with no attachments", function* () {
			var item = yield createDataObject('item');
			assert.lengthOf(item.getAttachments(), 0);
		})
		
		it("should update after an attachment is moved to another item", function* () {
			var item1 = yield createDataObject('item');
			var item2 = yield createDataObject('item');
			var item3 = new Zotero.Item('attachment');
			item3.parentID = item1.id;
			item3.attachmentLinkMode = 'linked_url';
			item3.setField('url', 'http://example.com');
			yield item3.saveTx();
			
			assert.lengthOf(item1.getAttachments(), 1);
			assert.lengthOf(item2.getAttachments(), 0);
			
			item3.parentID = item2.id;
			yield item3.saveTx();
			
			assert.lengthOf(item1.getAttachments(), 0);
			assert.lengthOf(item2.getAttachments(), 1);
		});
	})
	
	describe("#numNotes()", function () {
		it("should include child notes", function* () {
			var item = yield createDataObject('item');
			yield createDataObject('item', { itemType: 'note', parentID: item.id });
			yield createDataObject('item', { itemType: 'note', parentID: item.id });
			assert.equal(item.numNotes(), 2);
		});
		
		it("shouldn't include trashed child notes by default", function* () {
			var item = yield createDataObject('item');
			yield createDataObject('item', { itemType: 'note', parentID: item.id });
			yield createDataObject('item', { itemType: 'note', parentID: item.id, deleted: true });
			assert.equal(item.numNotes(), 1);
		});
		
		it("should include trashed child notes with includeTrashed", function* () {
			var item = yield createDataObject('item');
			yield createDataObject('item', { itemType: 'note', parentID: item.id });
			yield createDataObject('item', { itemType: 'note', parentID: item.id, deleted: true });
			assert.equal(item.numNotes(true), 2);
		});
		
		it("should include child attachment notes with includeEmbedded", function* () {
			var item = yield createDataObject('item');
			yield createDataObject('item', { itemType: 'note', parentID: item.id });
			var attachment = yield importFileAttachment('test.png', { parentID: item.id });
			attachment.setNote('test');
			yield attachment.saveTx();
			yield item.loadDataType('childItems');
			assert.equal(item.numNotes(false, true), 2);
		});
		
		it("shouldn't include empty child attachment notes with includeEmbedded", function* () {
			var item = yield createDataObject('item');
			yield createDataObject('item', { itemType: 'note', parentID: item.id });
			var attachment = yield importFileAttachment('test.png', { parentID: item.id });
			assert.equal(item.numNotes(false, true), 1);
		});
		
		// TODO: Fix numNotes(false, true) updating after child attachment note is added or removed
	});
	
	
	describe("#getNotes()", function () {
		it("#should return child notes", function* () {
			var item = yield createDataObject('item');
			var note = new Zotero.Item("note");
			note.parentID = item.id;
			yield note.saveTx();
			
			var notes = item.getNotes();
			assert.lengthOf(notes, 1);
			assert.equal(notes[0], note.id);
		})
		
		it("#should ignore trashed child notes by default", function* () {
			var item = yield createDataObject('item');
			var note = new Zotero.Item("note");
			note.parentID = item.id;
			note.deleted = true;
			yield note.saveTx();
			
			var notes = item.getNotes();
			assert.lengthOf(notes, 0);
		})
		
		it("#should include trashed child notes if includeTrashed=true", function* () {
			var item = yield createDataObject('item');
			var note = new Zotero.Item("note");
			note.parentID = item.id;
			note.deleted = true;
			yield note.saveTx();
			
			var notes = item.getNotes(true);
			assert.lengthOf(notes, 1);
			assert.equal(notes[0], note.id);
		})
		
		it("#should return an empty array for an item with no notes", function* () {
			var item = yield createDataObject('item');
			assert.lengthOf(item.getNotes(), 0);
		});
		
		it("should update after a note is moved to another item", function* () {
			var item1 = yield createDataObject('item');
			var item2 = yield createDataObject('item');
			var item3 = yield createDataObject('item', { itemType: 'note', parentID: item1.id });
			
			assert.lengthOf(item1.getNotes(), 1);
			assert.lengthOf(item2.getNotes(), 0);
			
			item3.parentID = item2.id;
			yield item3.saveTx();
			
			assert.lengthOf(item1.getNotes(), 0);
			assert.lengthOf(item2.getNotes(), 1);
		});
	})
	
	describe("#attachmentCharset", function () {
		it("should get and set a value", function* () {
			var charset = 'utf-8';
			var item = new Zotero.Item("attachment");
			item.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
			item.attachmentCharset = charset;
			var itemID = yield item.saveTx();
			assert.equal(item.attachmentCharset, charset);
			item = yield Zotero.Items.getAsync(itemID);
			assert.equal(item.attachmentCharset, charset);
		})
		
		it("should not allow a numerical value", function* () {
			var charset = 1;
			var item = new Zotero.Item("attachment");
			try {
				item.attachmentCharset = charset;
			}
			catch (e) {
				assert.equal(e.message, "Character set must be a string")
				return;
			}
			assert.fail("Numerical charset was allowed");
		})
		
		it("should not be marked as changed if not changed", function* () {
			var charset = 'utf-8';
			var item = new Zotero.Item("attachment");
			item.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
			item.attachmentCharset = charset;
			var itemID = yield item.saveTx();
			item = yield Zotero.Items.getAsync(itemID);
			
			// Set charset to same value
			item.attachmentCharset = charset
			assert.isFalse(item.hasChanged());
		})
	})
	
	describe("#attachmentFilename", function () {
		it("should get and set a filename for a stored file", function* () {
			var filename = "test.txt";
			
			// Create parent item
			var item = new Zotero.Item("book");
			var parentItemID = yield item.saveTx();
			
			// Create attachment item
			var item = new Zotero.Item("attachment");
			item.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
			item.parentID = parentItemID;
			var itemID = yield item.saveTx();
			
			// Should be empty when unset
			assert.equal(item.attachmentFilename, '');
			
			// Set filename
			item.attachmentFilename = filename;
			yield item.saveTx();
			item = yield Zotero.Items.getAsync(itemID);
			
			// Check filename
			assert.equal(item.attachmentFilename, filename);
			
			// Check full path
			var file = Zotero.Attachments.getStorageDirectory(item);
			file.append(filename);
			assert.equal(item.getFilePath(), file.path);
		});
		
		it.skip("should get and set a filename for a base-dir-relative file", function* () {
			
		})
	})
	
	describe("#attachmentPath", function () {
		it("should return an absolute path for a linked attachment", function* () {
			var file = getTestDataDirectory();
			file.append('test.png');
			var item = yield Zotero.Attachments.linkFromFile({ file });
			assert.equal(item.attachmentPath, file.path);
		})
		
		it("should return a prefixed path for an imported file", function* () {
			var file = getTestDataDirectory();
			file.append('test.png');
			var item = yield Zotero.Attachments.importFromFile({ file });
			
			assert.equal(item.attachmentPath, "storage:test.png");
		})
		
		it("should set a prefixed relative path for a path within the defined base directory", function* () {
			var dir = getTestDataDirectory().path;
			var dirname = OS.Path.basename(dir);
			var baseDir = OS.Path.dirname(dir);
			Zotero.Prefs.set('saveRelativeAttachmentPath', true)
			Zotero.Prefs.set('baseAttachmentPath', baseDir)
			
			var file = OS.Path.join(dir, 'test.png');
			
			var item = new Zotero.Item('attachment');
			item.attachmentLinkMode = 'linked_file';
			item.attachmentPath = file;
			
			assert.equal(item.attachmentPath, "attachments:data/test.png");
			
			Zotero.Prefs.set('saveRelativeAttachmentPath', false)
			Zotero.Prefs.clear('baseAttachmentPath')
		})
		
		it("should return a prefixed path for a linked attachment within the defined base directory", function* () {
			var dir = getTestDataDirectory().path;
			var dirname = OS.Path.basename(dir);
			var baseDir = OS.Path.dirname(dir);
			Zotero.Prefs.set('saveRelativeAttachmentPath', true)
			Zotero.Prefs.set('baseAttachmentPath', baseDir)
			
			var file = OS.Path.join(dir, 'test.png');
			
			var item = yield Zotero.Attachments.linkFromFile({
				file: Zotero.File.pathToFile(file)
			});
			
			assert.equal(item.attachmentPath, "attachments:data/test.png");
			
			Zotero.Prefs.set('saveRelativeAttachmentPath', false)
			Zotero.Prefs.clear('baseAttachmentPath')
		})
	})
	
	describe("#renameAttachmentFile()", function () {
		it("should rename an attached file", function* () {
			var file = getTestDataDirectory();
			file.append('test.png');
			var item = yield Zotero.Attachments.importFromFile({
				file: file
			});
			var newName = 'test2.png';
			yield item.renameAttachmentFile(newName);
			assert.equal(item.attachmentFilename, newName);
			var path = yield item.getFilePathAsync();
			assert.equal(OS.Path.basename(path), newName)
			yield OS.File.exists(path);
			
			// File should be flagged for upload
			// DEBUG: Is this necessary?
			assert.equal(item.attachmentSyncState, Zotero.Sync.Storage.Local.SYNC_STATE_TO_UPLOAD);
			assert.isNull(item.attachmentSyncedHash);
		});
		
		// Only relevant on a case-insensitive filesystem
		it("should rename an attached file with a case-only change (Mac)", async function () {
			var file = getTestDataDirectory();
			file.append('test.png');
			var item = await Zotero.Attachments.importFromFile({
				file: file
			});
			var newName = 'Test.png';
			await item.renameAttachmentFile(newName);
			assert.equal(item.attachmentFilename, newName);
			var path = await item.getFilePathAsync();
			assert.equal(OS.Path.basename(path), newName)
			await OS.File.exists(path);
		});
		
		it("should rename a linked file", function* () {
			var filename = 'test.png';
			var file = getTestDataDirectory();
			file.append(filename);
			var tmpDir = yield getTempDirectory();
			var tmpFile = OS.Path.join(tmpDir, filename);
			yield OS.File.copy(file.path, tmpFile);
			
			var item = yield Zotero.Attachments.linkFromFile({
				file: tmpFile
			});
			var newName = 'test2.png';
			yield assert.eventually.isTrue(item.renameAttachmentFile(newName));
			assert.equal(item.attachmentFilename, newName);
			var path = yield item.getFilePathAsync();
			assert.equal(OS.Path.basename(path), newName)
			yield OS.File.exists(path);
		})
	})
	
	
	describe("#getBestAttachmentState()", function () {
		it("should cache state for an existing file", function* () {
			var parentItem = yield createDataObject('item');
			var file = getTestDataDirectory();
			file.append('test.png');
			var childItem = yield Zotero.Attachments.importFromFile({
				file,
				parentItemID: parentItem.id
			});
			yield parentItem.getBestAttachmentState();
			assert.equal(parentItem.getBestAttachmentStateCached(), 1);
		})
		
		it("should cache state for a missing file", function* () {
			var parentItem = yield createDataObject('item');
			var file = getTestDataDirectory();
			file.append('test.png');
			var childItem = yield Zotero.Attachments.importFromFile({
				file,
				parentItemID: parentItem.id
			});
			let path = yield childItem.getFilePathAsync();
			yield OS.File.remove(path);
			yield parentItem.getBestAttachmentState();
			assert.equal(parentItem.getBestAttachmentStateCached(), -1);
		})
	})
	
	
	describe("#fileExists()", function () {
		it("should cache state for an existing file", function* () {
			var file = getTestDataDirectory();
			file.append('test.png');
			var item = yield Zotero.Attachments.importFromFile({ file });
			yield item.fileExists();
			assert.equal(item.fileExistsCached(), true);
		})
		
		it("should cache state for a missing file", function* () {
			var file = getTestDataDirectory();
			file.append('test.png');
			var item = yield Zotero.Attachments.importFromFile({ file });
			let path = yield item.getFilePathAsync();
			yield OS.File.remove(path);
			yield item.fileExists();
			assert.equal(item.fileExistsCached(), false);
		})
	})
	
	
	describe("#relinkAttachmentFile", function () {
		it("should copy a file elsewhere into the storage directory", function* () {
			var filename = 'test.png';
			var file = getTestDataDirectory();
			file.append(filename);
			var tmpDir = yield getTempDirectory();
			var tmpFile = OS.Path.join(tmpDir, filename);
			yield OS.File.copy(file.path, tmpFile);
			file = OS.Path.join(tmpDir, filename);
			
			var item = yield Zotero.Attachments.importFromFile({ file });
			let path = yield item.getFilePathAsync();
			yield OS.File.remove(path);
			yield OS.File.removeEmptyDir(OS.Path.dirname(path));
			
			assert.isFalse(yield item.fileExists());
			yield item.relinkAttachmentFile(file);
			assert.isTrue(yield item.fileExists());
			
			assert.isTrue(yield OS.File.exists(tmpFile));
		});
		
		it("should handle normalized filenames", function* () {
			var item = yield importFileAttachment('test.png');
			var path = yield item.getFilePathAsync();
			var dir = OS.Path.dirname(path);
			var filename = 'tést.pdf'.normalize('NFKD');
			
			// Make sure we're actually testing something -- the test string should be differently
			// normalized from what's done in getValidFileName
			assert.notEqual(filename, Zotero.File.getValidFileName(filename));
			
			var newPath = OS.Path.join(dir, filename);
			yield OS.File.move(path, newPath);
			
			assert.isFalse(yield item.fileExists());
			yield item.relinkAttachmentFile(newPath);
			assert.isTrue(yield item.fileExists());
		});
	});
	
	
	describe("#setTags", function () {
		it("should save an array of tags in API JSON format", function* () {
			var tags = [
				{
					tag: "A"
				},
				{
					tag: "B"
				}
			];
			var item = new Zotero.Item('journalArticle');
			item.setTags(tags);
			var id = yield item.saveTx();
			item = Zotero.Items.get(id);
			assert.sameDeepMembers(item.getTags(tags), tags);
		})
		
		it("shouldn't mark item as changed if tags haven't changed", function* () {
			var tags = [
				{
					tag: "A"
				},
				{
					tag: "B"
				}
			];
			var item = new Zotero.Item('journalArticle');
			item.setTags(tags);
			var id = yield item.saveTx();
			item = Zotero.Items.get(id);
			item.setTags(tags);
			assert.isFalse(item.hasChanged());
		})
		
		it("should remove an existing tag", function* () {
			var tags = [
				{
					tag: "A"
				},
				{
					tag: "B"
				}
			];
			var item = new Zotero.Item('journalArticle');
			item.setTags(tags);
			var id = yield item.saveTx();
			item = Zotero.Items.get(id);
			item.setTags(tags.slice(0));
			yield item.saveTx();
			assert.sameDeepMembers(item.getTags(tags), tags.slice(0));
		})
	})
	
	describe("#addTag", function () {
		it("should add a tag", function* () {
			var item = createUnsavedDataObject('item');
			item.addTag('a');
			yield item.saveTx();
			var tags = item.getTags();
			assert.deepEqual(tags, [{ tag: 'a' }]);
		})
		
		it("should add two tags", function* () {
			var item = createUnsavedDataObject('item');
			item.addTag('a');
			item.addTag('b');
			yield item.saveTx();
			var tags = item.getTags();
			assert.sameDeepMembers(tags, [{ tag: 'a' }, { tag: 'b' }]);
		})
		
		it("should add two tags of different types", function* () {
			var item = createUnsavedDataObject('item');
			item.addTag('a');
			item.addTag('b', 1);
			yield item.saveTx();
			var tags = item.getTags();
			assert.sameDeepMembers(tags, [{ tag: 'a' }, { tag: 'b', type: 1 }]);
		})
		
		it("should add a tag to an existing item", function* () {
			var item = yield createDataObject('item');
			item.addTag('a');
			yield item.saveTx();
			var tags = item.getTags();
			assert.deepEqual(tags, [{ tag: 'a' }]);
		})
		
		it("should add two tags to an existing item", function* () {
			var item = yield createDataObject('item');
			item.addTag('a');
			item.addTag('b');
			yield item.saveTx();
			var tags = item.getTags();
			assert.sameDeepMembers(tags, [{ tag: 'a' }, { tag: 'b' }]);
		})
	})
	
	//
	// Relations and related items
	//
	describe("#addRelatedItem", function () {
		it("should add a dc:relation relation to an item", function* () {
			var item1 = yield createDataObject('item');
			var item2 = yield createDataObject('item');
			item1.addRelatedItem(item2);
			yield item1.saveTx();
			
			var rels = item1.getRelationsByPredicate(Zotero.Relations.relatedItemPredicate);
			assert.lengthOf(rels, 1);
			assert.equal(rels[0], Zotero.URI.getItemURI(item2));
		})
		
		it("should allow an unsaved item to be related to an item in the user library", function* () {
			var item1 = yield createDataObject('item');
			var item2 = createUnsavedDataObject('item');
			item2.addRelatedItem(item1);
			yield item2.saveTx();
			
			var rels = item2.getRelationsByPredicate(Zotero.Relations.relatedItemPredicate);
			assert.lengthOf(rels, 1);
			assert.equal(rels[0], Zotero.URI.getItemURI(item1));
		})
		
		it("should throw an error for a relation in a different library", function* () {
			var group = yield getGroup();
			var item1 = yield createDataObject('item');
			var item2 = yield createDataObject('item', { libraryID: group.libraryID });
			try {
				item1.addRelatedItem(item2)
			}
			catch (e) {
				assert.ok(e);
				assert.equal(e.message, "Cannot relate item to an item in a different library");
				return;
			}
			assert.fail("addRelatedItem() allowed for an item in a different library");
		})
	})
	
	describe("#save()", function () {
		it("should throw an error for an empty item without an item type", function* () {
			var item = new Zotero.Item;
			var e = yield getPromiseError(item.saveTx());
			assert.ok(e);
			assert.equal(e.message, "Item type must be set before saving");
		})
		
		it("should reload child items for parent items", function* () {
			var item = yield createDataObject('item');
			var attachment = yield importFileAttachment('test.png', { parentItemID: item.id });
			var note1 = new Zotero.Item('note');
			note1.parentItemID = item.id;
			yield note1.saveTx();
			var note2 = new Zotero.Item('note');
			note2.parentItemID = item.id;
			yield note2.saveTx();
			
			assert.lengthOf(item.getAttachments(), 1);
			assert.lengthOf(item.getNotes(), 2);
			
			note2.parentItemID = null;
			yield note2.saveTx();
			
			assert.lengthOf(item.getAttachments(), 1);
			assert.lengthOf(item.getNotes(), 1);
		});
	})
	
	
	describe("#_eraseData()", function () {
		it("should remove relations pointing to this item", function* () {
			var item1 = yield createDataObject('item');
			var item2 = yield createDataObject('item');
			item1.addRelatedItem(item2);
			yield item1.saveTx();
			item2.addRelatedItem(item1);
			yield item2.saveTx();
			
			yield item1.eraseTx();
			
			assert.lengthOf(item2.relatedItems, 0);
			yield assert.eventually.equal(
				Zotero.DB.valueQueryAsync("SELECT COUNT(*) FROM itemRelations WHERE itemID=?", item2.id),
				0
			);
		});
		
		it("should remove an item in a collection in a read-only library", async function () {
			var group = await createGroup();
			var libraryID = group.libraryID;
			var collection = await createDataObject('collection', { libraryID });
			var item = await createDataObject('item', { libraryID, collections: [collection.id] });
			
			group.editable = false;
			await group.save();
			
			await item.eraseTx({
				skipEditCheck: true
			});
		});
	});
	
	
	describe("#multiDiff", function () {
		it("should return set of alternatives for differing fields in other items", function* () {
			var type = 'item';
			
			var dates = ['2016-03-08 17:44:45'];
			var accessDates = ['2016-03-08T18:44:45Z'];
			var urls = ['http://www.example.com', 'http://example.net'];
			
			var obj1 = createUnsavedDataObject(type);
			obj1.setField('date', '2016-03-07 12:34:56'); // different in 1 and 3, not in 2
			obj1.setField('url', 'http://example.com'); // different in all three
			obj1.setField('title', 'Test'); // only in 1
			
			var obj2 = createUnsavedDataObject(type);
			obj2.setField('url', urls[0]);
			obj2.setField('accessDate', accessDates[0]); // only in 2
			
			var obj3 = createUnsavedDataObject(type);
			obj3.setField('date', dates[0]);
			obj3.setField('url', urls[1]);
			
			var alternatives = obj1.multiDiff([obj2, obj3]);
			
			assert.sameMembers(Object.keys(alternatives), ['url', 'date', 'accessDate']);
			assert.sameMembers(alternatives.url, urls);
			assert.sameMembers(alternatives.date, dates);
			assert.sameMembers(alternatives.accessDate, accessDates);
		});
	});
	
	
	describe("#clone()", function () {
		// TODO: Expand to other data
		it("[MULTI] should copy creators", function* () {
			var item = new Zotero.Item('book');
			item.setCreators([
				{
					firstName: "A",
					lastName: "Test",
					creatorType: 'author',
					multi: {
						_key: {}
					}
				}
			]);
			yield item.saveTx();
			var newItem = item.clone();
			assert.sameDeepMembers(item.getCreators(), newItem.getCreators());
		})
		
		it("shouldn't copy linked-item relation", async function () {
			var group = await getGroup();
			var groupItem = await createDataObject('item', { libraryID: group.libraryID });
			var item = await createDataObject('item');
			await item.addLinkedItem(groupItem);
			assert.equal(await item.getLinkedItem(group.libraryID), groupItem);
			var newItem = item.clone();
			assert.isEmpty(Object.keys(newItem.toJSON().relations));
		});
	})
	
	describe("#moveToLibrary()", function () {
		it("should move items from My Library to a filesEditable group", async function () {
			var group = await createGroup();
			
			var item = await createDataObject('item');
			var attachment1 = await importFileAttachment('test.png', { parentID: item.id });
			var file = getTestDataDirectory();
			file.append('test.png');
			var attachment2 = await Zotero.Attachments.linkFromFile({
				file,
				parentItemID: item.id
			});
			var note = await createDataObject('item', { itemType: 'note', parentID: item.id });
			
			var originalIDs = [item.id, attachment1.id, attachment2.id, note.id];
			var originalAttachmentFile = attachment1.getFilePath();
			var originalAttachmentHash = await attachment1.attachmentHash
			
			assert.isTrue(await OS.File.exists(originalAttachmentFile));
			
			var newItem = await item.moveToLibrary(group.libraryID);
			
			// Old items and file should be gone
			assert.isTrue(originalIDs.every(id => !Zotero.Items.get(id)));
			assert.isFalse(await OS.File.exists(originalAttachmentFile));
			
			// New items and stored file should exist; linked file should be gone
			assert.equal(newItem.libraryID, group.libraryID);
			assert.lengthOf(newItem.getAttachments(), 1);
			var newAttachment = Zotero.Items.get(newItem.getAttachments()[0]);
			assert.equal(await newAttachment.attachmentHash, originalAttachmentHash);
			assert.lengthOf(newItem.getNotes(), 1);
		});
		
		it("should move items from My Library to a non-filesEditable group", async function () {
			var group = await createGroup({
				filesEditable: false
			});
			
			var item = await createDataObject('item');
			var attachment = await importFileAttachment('test.png', { parentID: item.id });
			
			var originalIDs = [item.id, attachment.id];
			var originalAttachmentFile = attachment.getFilePath();
			var originalAttachmentHash = await attachment.attachmentHash
			
			assert.isTrue(await OS.File.exists(originalAttachmentFile));
			
			var newItem = await item.moveToLibrary(group.libraryID);
			
			// Old items and file should be gone
			assert.isTrue(originalIDs.every(id => !Zotero.Items.get(id)));
			assert.isFalse(await OS.File.exists(originalAttachmentFile));
			
			// Parent should exist, but attachment should not
			assert.equal(newItem.libraryID, group.libraryID);
			assert.lengthOf(newItem.getAttachments(), 0);
		});
	});
	
	describe("#toJSON()", function () {
		describe("default mode", function () {
			it("[MULTI] should output only fields with values", function* () {
				var itemType = "book";
				var title = "Test";
				var multiTitle = "Test Multi";
				var langTag = "fr-FR"
				
				var item = new Zotero.Item(itemType);
				item.setField("title", title);
				item.setField("title", multiTitle, false, langTag)
				var id = yield item.saveTx();
				item = Zotero.Items.get(id);
				var json = item.toJSON();
				
				assert.equal(json.itemType, itemType);
				assert.equal(json.title, title);
				assert.isUndefined(json.date);
				assert.isUndefined(json.numPages);
				assert.isDefined(json.multi);
				assert.isDefined(json.multi._keys);
				assert.isDefined(json.multi._keys['title']);
				assert.isDefined(json.multi._keys['title'][langTag]);
				assert.equal(json.multi._keys['title'][langTag], multiTitle);
				assert.isUndefined(json.multi._keys['date']);
				assert.isUndefined(json.multi._keys['numPages']);
			})
			
			it("should output 'deleted' as 1", function* () {
				var itemType = "book";
				var title = "Test";
				
				var item = new Zotero.Item(itemType);
				item.setField("title", title);
				item.deleted = true;
				var id = yield item.saveTx();
				item = Zotero.Items.get(id);
				var json = item.toJSON();
				
				assert.strictEqual(json.deleted, 1);
			})
			
			it.skip("should output attachment fields from file", function* () {
				var file = getTestDataDirectory();
				file.append('test.png');
				var item = yield Zotero.Attachments.importFromFile({ file });
				
				yield Zotero.DB.executeTransaction(function* () {
					yield Zotero.Sync.Storage.Local.setSyncedModificationTime(
						item.id, new Date().getTime()
					);
					yield Zotero.Sync.Storage.Local.setSyncedHash(
						item.id, 'b32e33f529942d73bea4ed112310f804'
					);
				});
				
				var json = item.toJSON();
				assert.equal(json.linkMode, 'imported_file');
				assert.equal(json.filename, 'test.png');
				assert.isUndefined(json.path);
				assert.equal(json.mtime, (yield item.attachmentModificationTime));
				assert.equal(json.md5, (yield item.attachmentHash));
			})
			
			it("should omit storage values with .skipStorageProperties", function* () {
				var file = getTestDataDirectory();
				file.append('test.png');
				var item = yield Zotero.Attachments.importFromFile({ file });
				
				item.attachmentSyncedModificationTime = new Date().getTime();
				item.attachmentSyncedHash = 'b32e33f529942d73bea4ed112310f804';
				yield item.saveTx({ skipAll: true });
				
				var json = item.toJSON({
					skipStorageProperties: true
				});
				assert.isUndefined(json.mtime);
				assert.isUndefined(json.md5);
			});
			
			it("should output synced storage values with .syncedStorageProperties", function* () {
				var item = new Zotero.Item('attachment');
				item.attachmentLinkMode = 'imported_file';
				item.fileName = 'test.txt';
				yield item.saveTx();
				
				var mtime = new Date().getTime();
				var md5 = 'b32e33f529942d73bea4ed112310f804';
				
				item.attachmentSyncedModificationTime = mtime;
				item.attachmentSyncedHash = md5;
				yield item.saveTx({ skipAll: true });
				
				var json = item.toJSON({
					syncedStorageProperties: true
				});
				assert.equal(json.mtime, mtime);
				assert.equal(json.md5, md5);
			})
			
			it.skip("should output unset storage properties as null", function* () {
				var item = new Zotero.Item('attachment');
				item.attachmentLinkMode = 'imported_file';
				item.fileName = 'test.txt';
				var id = yield item.saveTx();
				var json = item.toJSON();
				
				assert.isNull(json.mtime);
				assert.isNull(json.md5);
			})
			
			it("shouldn't include filename or path for linked_url attachments", function* () {
				var item = new Zotero.Item('attachment');
				item.attachmentLinkMode = 'linked_url';
				item.url = "https://www.zotero.org/";
				var json = item.toJSON();
				assert.notProperty(json, "filename");
				assert.notProperty(json, "path");
			});
			
			it("should include inPublications=true for items in My Publications", function* () {
				var item = createUnsavedDataObject('item');
				item.inPublications = true;
				var json = item.toJSON();
				assert.propertyVal(json, "inPublications", true);
			});
			
			it("shouldn't include inPublications for items not in My Publications in patch mode", function* () {
				var item = createUnsavedDataObject('item');
				var json = item.toJSON();
				assert.notProperty(json, "inPublications");
			});
			
			it("should include inPublications=false for personal-library items not in My Publications in full mode", async function () {
				var item = createUnsavedDataObject('item', { libraryID: Zotero.Libraries.userLibraryID });
				var json = item.toJSON({ mode: 'full' });
				assert.property(json, "inPublications", false);
			});
			
			it("shouldn't include inPublications=false for group items not in My Publications in full mode", function* () {
				var group = yield getGroup();
				var item = createUnsavedDataObject('item', { libraryID: group.libraryID });
				var json = item.toJSON({ mode: 'full' });
				assert.notProperty(json, "inPublications");
			});
		})
		
		describe("[MULTI] 'full' mode", function () {
			it("should output all fields", function* () {
				var itemType = "book";
				var title = "Test";
				var title = "Test Foo";
				var langTag = "de-DE";

				var item = new Zotero.Item(itemType);
				item.setField("title", title);
				item.setField("title", title, false, langTag);
				var id = yield item.saveTx();
				item = yield Zotero.Items.getAsync(id);
				var json = item.toJSON({ mode: 'full' });
				assert.equal(json.title, title);
				assert.isDefined(json.multi);
				assert.isDefined(json.multi.main);
				assert.isUndefined(json.multi.main["title"]);
				assert.isDefined(json.multi._keys);
				assert.isDefined(json.multi._keys["title"]);
				assert.equal(json.multi._keys["title"]["de-DE"], "Test Foo");
				assert.isUndefined(json.multi._keys["publisher"]);
				assert.equal(json.date, "");
				assert.equal(json.numPages, "");
			})
		})
		
		describe("'patch' mode", function () {
			it("[MULTI] should output only fields that differ", function* () {
				var itemType = "bookSection";
				var onlyTitle = "Test";
				var onlyMultiTitle = "テスト";
				var onlyPublisherPlace = "Atlantis";
				var doomedMultiPublisherPlace = "Uh-oh";
				var onlyPublisher = "Publisher";

				var oldBookTitle = "Book Test";
				var oldMultiBookTitle = "テスト";

				var newBookTitle = "Book Test new";
				var newMultiBookTitle = "テスト new";

				var firstDate = "2015-12-31";
				var firstMultiPublisher = "出版社 new";
				
				var item = new Zotero.Item(itemType);
				item.setField("title", onlyTitle);
				item.setField("title", onlyMultiTitle, false, 'ja-JP');
				item.setField("bookTitle", oldBookTitle);
				item.setField("bookTitle", oldMultiBookTitle, false, 'ja-JP');
				item.setField("publisher", onlyPublisher);
				item.setField("place", onlyPublisherPlace);
				item.setField("place", doomedMultiPublisherPlace, false, 'ja-JP');
				var id = yield item.saveTx();
				item = yield Zotero.Items.getAsync(id);
				var patchBase = item.toJSON();
				
				item.setField("bookTitle", newBookTitle);
				item.setField("bookTitle", newMultiBookTitle, false, 'ja-JP');
				item.setField("date", firstDate);
				item.setField("publisher", firstMultiPublisher, false, 'ja-JP');
				item.setField("place", "", false, 'ja-JP');
				yield item.saveTx();
				var json = item.toJSON({
					patchBase: patchBase
				})
				assert.isUndefined(json.itemType);
				assert.isUndefined(json.title);
				assert.equal(json.date, firstDate, "New field retained");

				assert.isUndefined(json.multi);

				// Patch mode returns patch with all extended field content encoded in "extra" field.
				//assert.isDefined(json.multi._keys);
				//assert.isDefined(json.multi._keys['title'], "Empty stub of removed variants retained");
				//assert.isUndefined(json.multi._keys['title']['ja-JP'], "Unchanged variant removed");
				//assert.isDefined(json.multi._keys['bookTitle'], "Changed variant retained");
				//assert.isDefined(json.multi._keys['place'], "Empty stub of removed variants retained");
				//assert.equal(json.multi._keys['place']['ja-JP'], '', "Deleted variant marked for removal");
				//assert.equal(item.getField('place', false, false, 'ja-JP'), 'Atlantis', "Use headline value when variant does not exist");
				assert.isUndefined(json.numPages);
				assert.isUndefined(json.deleted);
				assert.isUndefined(json.creators);
				assert.isUndefined(json.relations);
				assert.isUndefined(json.tags);
			})
			
			it("should include changed 'deleted' field", function* () {
				// True to false
				var item = new Zotero.Item('book');
				item.deleted = true;
				var id = yield item.saveTx();
				item = yield Zotero.Items.getAsync(id);
				var patchBase = item.toJSON();
				
				item.deleted = false;
				var json = item.toJSON({
					patchBase: patchBase
				})
				assert.isUndefined(json.title);
				assert.isFalse(json.deleted);
				
				// False to true
				var item = new Zotero.Item('book');
				item.deleted = false;
				var id = yield item.saveTx();
				item = yield Zotero.Items.getAsync(id);
				var patchBase = item.toJSON();
				
				item.deleted = true;
				var json = item.toJSON({
					patchBase: patchBase
				})
				assert.isUndefined(json.title);
				assert.strictEqual(json.deleted, 1);
			})
			
			it("should set 'parentItem' to false when cleared", function* () {
				var item = yield createDataObject('item');
				var note = new Zotero.Item('note');
				note.parentID = item.id;
				// Create initial JSON with parentItem
				var patchBase = note.toJSON();
				// Clear parent item and regenerate JSON
				note.parentID = false;
				var json = note.toJSON({ patchBase });
				assert.isFalse(json.parentItem);
			});
			
			it("should include relations if related item was removed", function* () {
				var item1 = yield createDataObject('item');
				var item2 = yield createDataObject('item');
				var item3 = yield createDataObject('item');
				var item4 = yield createDataObject('item');
				
				var relateItems = Zotero.Promise.coroutine(function* (i1, i2) {
					yield Zotero.DB.executeTransaction(function* () {
						i1.addRelatedItem(i2);
						yield i1.save({
							skipDateModifiedUpdate: true
						});
						i2.addRelatedItem(i1);
						yield i2.save({
							skipDateModifiedUpdate: true
						});
					});
				});
				
				yield relateItems(item1, item2);
				yield relateItems(item1, item3);
				yield relateItems(item1, item4);
				
				var patchBase = item1.toJSON();
				
				item1.removeRelatedItem(item2);
				yield item1.saveTx();
				item2.removeRelatedItem(item1);
				yield item2.saveTx();
				
				var json = item1.toJSON({ patchBase });
				assert.sameMembers(json.relations['dc:relation'], item1.getRelations()['dc:relation']);
			});
			
			it("shouldn't clear storage properties from original in .skipStorageProperties mode", function* () {
				var item = new Zotero.Item('attachment');
				item.attachmentLinkMode = 'imported_file';
				item.attachmentFilename = 'test.txt';
				item.attachmentContentType = 'text/plain';
				item.attachmentCharset = 'utf-8';
				item.attachmentSyncedModificationTime = 1234567890000;
				item.attachmentSyncedHash = '18d21750c8abd5e3afa8ea89e3dfa570';
				var patchBase = item.toJSON({
					syncedStorageProperties: true
				});
				item.setNote("Test");
				var json = item.toJSON({
					patchBase,
					skipStorageProperties: true
				});
				Zotero.debug(json);
				assert.equal(json.note, "Test");
				assert.notProperty(json, "md5");
				assert.notProperty(json, "mtime");
			});
		})
	})
	
	describe("#fromJSON()", function () {
		it("should clear missing fields", function* () {
			var item = new Zotero.Item('book');
			item.setField('title', 'Test');
			item.setField('date', '2016');
			item.setField('accessDate', '2015-06-07T20:56:00Z');
			yield item.saveTx();
			var json = item.toJSON();
			// Remove fields, which should cause them to be cleared in fromJSON()
			delete json.date;
			delete json.accessDate;
			
			item.fromJSON(json);
			assert.strictEqual(item.getField('title'), 'Test');
			assert.strictEqual(item.getField('date'), '');
			assert.strictEqual(item.getField('accessDate'), '');
		});
		
		it("should remove item from collection if 'collections' property not provided", function* () {
			var collection = yield createDataObject('collection');
			// Create standalone attachment in collection
			var attachment = yield importFileAttachment('test.png', { collections: [collection.id] });
			var item = yield createDataObject('item', { collections: [collection.id] });
			
			assert.isTrue(collection.hasItem(attachment.id));
			var json = attachment.toJSON();
			json.path = 'storage:test2.png';
			// Add to parent, which implicitly removes from collection
			json.parentItem = item.key;
			delete json.collections;
			attachment.fromJSON(json);
			yield attachment.saveTx();
			assert.isFalse(collection.hasItem(attachment.id));
		});
		
		it("should remove child item from parent if 'parentKey' property not provided", async function () {
			var item = await createDataObject('item');
			var note = await createDataObject('item', { itemType: 'note', parentKey: [item.key] });
			
			var json = note.toJSON();
			delete json.parentItem;
			
			note.fromJSON(json);
			await note.saveTx();
			
			assert.lengthOf(item.getNotes(), 0);
		});
		
		it("should remove item from trash if 'deleted' property not provided", async function () {
			var item = await createDataObject('item', { deleted: true });
			
			assert.isTrue(item.deleted);
			
			var json = item.toJSON();
			delete json.deleted;
			
			item.fromJSON(json);
			await item.saveTx();
			
			assert.isFalse(item.deleted);
		});
		
		it("should remove item from My Publications if 'inPublications' property not provided", async function () {
			var item = await createDataObject('item', { inPublications: true });
			
			assert.isTrue(item.inPublications);
			
			var json = item.toJSON();
			delete json.inPublications;
			
			item.fromJSON(json);
			await item.saveTx();
			
			assert.isFalse(item.inPublications);
		});
		
		// Not currently following this behavior
		/*it("should move valid field in Extra to field if not set", function () {
			var doi = '10.1234/abcd';
			var json = {
				itemType: "journalArticle",
				title: "Test",
				extra: `DOI: ${doi}`
			};
			var item = new Zotero.Item;
			item.fromJSON(json);
			assert.equal(item.getField('DOI'), doi);
			assert.equal(item.getField('extra'), '');
		});
		
		it("shouldn't move valid field in Extra to field if also present in JSON", function () {
			var doi1 = '10.1234/abcd';
			var doi2 = '10.2345/bcde';
			var json = {
				itemType: "journalArticle",
				title: "Test",
				DOI: doi1,
				extra: `doi: ${doi2}`
			};
			var item = new Zotero.Item;
			item.fromJSON(json);
			assert.equal(item.getField('DOI'), doi1);
			assert.equal(item.getField('extra'), `doi: ${doi2}`);
		});
		
		it("shouldn't move valid field in Extra to field if already set", function () {
			var doi1 = '10.1234/abcd';
			var doi2 = '10.2345/bcde';
			var json = {
				itemType: "journalArticle",
				title: "Test",
				multi: {
					main: {},
					_keys: {}
				},
				DOI: doi1,
				extra: `doi: ${doi2}`
			};
			var item = new Zotero.Item('journalArticle');
			item.setField('DOI', doi1);
			item.fromJSON(json);
			assert.equal(item.getField('DOI'), doi1);
			assert.equal(item.getField('extra'), `doi: ${doi2}`);
		});*/
		
		it("should ignore creator field in Extra", async function () {
			var json = {
				itemType: "journalArticle",
				extra: "Author: Name"
			};
			var item = new Zotero.Item();
			item.fromJSON(json);
			assert.lengthOf(item.getCreatorsJSON(), 0);
			assert.equal(item.getField('extra'), json.extra);
		});
		
		describe("not-strict mode", function () {
			it("should handle Extra in non-strict mode", function () {
				var json = {
					itemType: "journalArticle",
					title: "Test",
					extra: "Here's some extra text"
				};
				var item = new Zotero.Item();
				item.fromJSON(json);
				assert.equal(item.getField('extra'), json.extra);
			});
			
			it("should store unknown fields in Extra", function () {
				var json = {
					itemType: "journalArticle",
					title: "Test",
					fooBar: "123",
					testField: "test value"
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('title'), 'Test');
				assert.equal(item.getField('extra'), 'Foo Bar: 123\nTest Field: test value');
			});
			
			it("should replace unknown field in Extra", function () {
				var json = {
					itemType: "journalArticle",
					title: "Test",
					foo: "BBB",
					extra: "Foo: AAA\nBar: CCC"
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('title'), 'Test');
				assert.equal(item.getField('extra'), 'Foo: BBB\nBar: CCC');
			});
			
			it("should store invalid-for-type field in Extra", function () {
				var json = {
					itemType: "journalArticle",
					title: "Test",
					medium: "123"
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('title'), 'Test');
				assert.equal(item.getField('extra'), 'Medium: 123');
			});
			
			it("should ignore invalid-for-type base-mapped field if valid-for-type base field is set in Extra", function () {
				var json = {
					itemType: "document",
					publisher: "Foo", // Valid for 'document'
					company: "Bar" // Not valid for 'document', but mapped to base field 'publisher'
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('publisher'), 'Foo');
				assert.equal(item.getField('extra'), '');
			});
			
			it("shouldn't include base field or invalid base-mapped field in Extra if valid base-mapped field is set", function () {
				var json = {
					itemType: "audioRecording",
					publisher: "A", // Base field, which will be overwritten by the valid base-mapped field
					label: "B", // Valid base-mapped field, which should be stored
					company: "C", // Invalid base-mapped field, which should be ignored
					foo: "D" // Invalid other field, which should be added to Extra
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('label'), 'B');
				assert.equal(item.getField('extra'), 'Foo: D');
			});
			
			it("should remove invalid-for-type base-mapped fields with same values and use base field if not present when storing in Extra", function () {
				var json = {
					itemType: "artwork",
					publisher: "Foo", // Invalid base field
					company: "Foo", // Invalid base-mapped field
					label: "Foo" // Invaid base-mapped field
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('extra'), 'Publisher: Foo');
			});
			
			it("should remove invalid-for-type base-mapped Type fields when storing in Extra", function () {
				var json = {
					itemType: "document",
					reportType: "Foo", // Invalid base-mapped field
					websiteType: "Foo" // Invaid base-mapped field
				};
				// Confirm that 'type' is still invalid for 'document', in case this changes
				assert.isFalse(Zotero.ItemFields.isValidForType(
					Zotero.ItemFields.getID('type'),
					Zotero.ItemTypes.getID('document')
				));
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('extra'), '');
			});
			
			it("should ignore some redundant fields from RDF translator (temporary)", function () {
				var json = {
					itemType: "book",
					edition: "1",
					versionNumber: "1"
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('edition'), "1");
				assert.equal(item.getField('extra'), '');
				
				json = {
					itemType: "presentation",
					meetingName: "Foo",
					conferenceName: "Foo"
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('meetingName'), "Foo");
				assert.equal(item.getField('extra'), '');
				
				json = {
					itemType: "journalArticle",
					publicationTitle: "Foo",
					reporter: "Foo"
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('publicationTitle'), "Foo");
				assert.equal(item.getField('extra'), '');
				
				json = {
					itemType: "conferencePaper",
					proceedingsTitle: "Foo",
					reporter: "Foo"
				};
				var item = new Zotero.Item;
				item.fromJSON(json);
				assert.equal(item.getField('proceedingsTitle'), "Foo");
				assert.equal(item.getField('extra'), '');
			});
		});
		
		describe("strict mode", function () {
			it("should throw on unknown field", function () {
				var json = {
					itemType: "journalArticle",
					title: "Test",
					foo: "Bar"
				};
				var item = new Zotero.Item;
				var f = () => {
					item.fromJSON(json, { strict: true });
				};
				assert.throws(f, /^Unknown field/);
			});
			
			it("should throw on invalid field for a given item type", function () {
				var json = {
					itemType: "journalArticle",
					title: "Test",
					numPages: "123"
				};
				var item = new Zotero.Item;
				var f = () => {
					item.fromJSON(json, { strict: true });
				};
				assert.throws(f, /^Invalid field/);
			});
			
			it("should throw on unknown creator type", function () {
				var json = {
					itemType: "journalArticle",
					title: "Test",
					creators: [
						{
							firstName: "First",
							lastName: "Last",
							creatorType: "unknown"
						}
					]
				};
				var item = new Zotero.Item;
				var f = () => {
					item.fromJSON(json, { strict: true });
				};
				assert.throws(f, /^Unknown creator type/);
			});
			
			it("should throw on invalid creator type for a given item type", function () {
				var json = {
					itemType: "journalArticle",
					title: "Test",
					creators: [
						{
							firstName: "First",
							lastName: "Last",
							creatorType: "interviewee"
						}
					]
				};
				var item = new Zotero.Item;
				var f = () => {
					item.fromJSON(json, { strict: true });
				};
				assert.throws(f, /^Invalid creator type/);
			});
		});
		
		it("should accept ISO 8601 dates", function* () {
			var json = {
				itemType: "journalArticle",
				accessDate: "2015-06-07T20:56:00Z",
				dateAdded: "2015-06-07T20:57:00Z",
				dateModified: "2015-06-07T20:58:00Z",
			};
			var item = new Zotero.Item;
			item.fromJSON(json);
			assert.equal(item.getField('accessDate'), '2015-06-07 20:56:00');
			assert.equal(item.dateAdded, '2015-06-07 20:57:00');
			assert.equal(item.dateModified, '2015-06-07 20:58:00');
		})
		
		it("should accept ISO 8601 access date without time", function* () {
			var json = {
				itemType: "journalArticle",
				accessDate: "2015-06-07",
				dateAdded: "2015-06-07T20:57:00Z",
				dateModified: "2015-06-07T20:58:00Z",
			};
			var item = new Zotero.Item;
			item.fromJSON(json);
			assert.equal(item.getField('accessDate'), '2015-06-07');
			assert.equal(item.dateAdded, '2015-06-07 20:57:00');
			assert.equal(item.dateModified, '2015-06-07 20:58:00');
		})
		
		it("should ignore non–ISO 8601 dates", function* () {
			var json = {
				itemType: "journalArticle",
				accessDate: "2015-06-07 20:56:00",
				dateAdded: "2015-06-07 20:57:00",
				dateModified: "2015-06-07 20:58:00",
			};
			var item = new Zotero.Item;
			item.fromJSON(json);
			assert.strictEqual(item.getField('accessDate'), '');
			// DEBUG: Should these be null, or empty string like other fields from getField()?
			assert.isNull(item.dateAdded);
			assert.isNull(item.dateModified);
		})
		
		it("should set creators", function* () {
			var json = {
				itemType: "journalArticle",
				creators: [
					{
						firstName: "First",
						lastName: "Last",
						creatorType: "author",
						multi: {
							_key: {}
						}
					},
					{
						name: "Test Name",
						creatorType: "editor",
						multi: {
							_key: {}
						}
					}
				]
			};
			
			var item = new Zotero.Item;
			item.fromJSON(json);
			var id = yield item.saveTx();
			assert.sameDeepMembers(item.getCreatorsJSON(), json.creators);
		})
		
		it("[MULTI] should set creators with main language", function* () {
			var json = {
				itemType: "journalArticle",
				creators: [
					{
						firstName: "First",
						lastName: "Last",
						creatorType: "author",
						multi: {
							main: 'en-US',
							_key: {}
						}
					},
					{
						name: "Test Name",
						creatorType: "editor",
						multi: {
							main: 'fr-FR',
							_key: {}
						}
					}
				]
			};
			
			var item = new Zotero.Item;
			item.fromJSON(json);
			var id = yield item.saveTx();
			assert.sameDeepMembers(item.getCreatorsJSON(), json.creators);
		})
		
		it("[MULTI] should set creators with multilingual variants", function* () {
			var json = {
				itemType: "journalArticle",
				creators: [
					{
						firstName: "First",
						lastName: "Last (2)",
						creatorType: "author",
						multi: {
							_key: {
								'fr-FR': {
									firstName: 'Premiere',
									lastName: 'Nom'
								}									
							},
							main: 'en-US'
						}
					},
					{
						name: "Nom d'Essai (2)",
						creatorType: "editor",
						multi: {
							_key: {
								'en-US': {
									name: 'Test Name'
								}									
							},
							main: 'fr-FR'
						}
					}
				]
			};
			
			var item = new Zotero.Item;
			item.fromJSON(json);
			var id = yield item.saveTx();
			assert.sameDeepMembers(item.getCreatorsJSON(), json.creators);
		})
		
		it("should map a base field to an item-specific field", function* () {
			var item = new Zotero.Item("bookSection");
			item.fromJSON({
				"itemType":"bookSection",
				"publicationTitle":"Publication Title",
				"multi": {
					"main": {},
					"_keys": {}
				}
			});
			assert.equal(item.getField("bookTitle"), "Publication Title");
		});
	});
});
