/**
 * Centralized V2EX DOM selectors.
 * Update here when V2EX changes its DOM structure.
 */
export const SELECTORS = {
  /** Main content area boxes (query from document) */
  mainBoxes: '#Main > .box',
  /** All comment cells (query from document) */
  allCells: '.cell',
  /** Comment cells with an id attribute (query from document) */
  cellsWithId: '.cell[id]',
  /** Comment cells within the main area (query from document) */
  mainCells: '#Main .cell[id]',
  /** Cells within a box (relative to box, use with :scope) */
  cellInBox: ':scope > .cell[id]',
  /** First cell within a box (relative to box, use with :scope) */
  firstCellInBox: ':scope > .cell',
  /** Cells in parsed HTML (query from parsed document) */
  parsedCells: '#Main > .box > .cell[id]',

  /** Author link within a cell (query from cell) */
  authorLink: 'strong > a[href]',
  /** Author link in comment table (relative to cell, use with :scope) */
  authorLinkInTable: ":scope > table strong a.dark[href^='/member/']",
  /** Member mention links (query from reply content) */
  memberMention: "a[href^='/member/']",

  /** Comment number (query from cell) */
  commentNumber: '.no',
  /** Comment number span (query from cell) */
  commentNumberSpan: 'span.no',
  /** Reply content (relative to cell, use with :scope) */
  replyContent: ':scope > table .reply_content',

  /** Heart icon for counting hearts */
  heartIcon: '[alt="❤️"]',

  /** Topic author avatar (query from document) */
  topicAuthor: '.header .avatar',
  /** Topic buttons container (query from document) */
  topicButtons: '.topic_buttons',
  /** Topic links to open in new tab (query from document) */
  topicLinks: '.topic-link, .item_hot_topic_title > a',

  /** Pagination elements (query from document) */
  pageNumbers: '.page_current, .page_normal',
  /** Current page indicator (query from document) */
  currentPage: '.page_current',
  /** Pagination container for cleanup (query from document) */
  paginationContainer: '.ps_container',

  /** Embedded discussion cells (query from document) */
  embeddedCell: '.cell[id] > .cell[id]',
  /** CSS class for collapsed discussions */
  collapsedClass: 'discussions-collapsed',

  /** Daily mission sign-in link (query from document) */
  signInLink: "a[href='/mission/daily']",

  /** Reference hints container (relative to cell, use with :scope) */
  referenceHints: ':scope > .gm-reference-hints',
  /** Table within a cell (relative to cell, use with :scope) */
  cellTable: ':scope > table',
} as const
