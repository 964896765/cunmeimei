'use strict';

const forumProjectIds = Object.freeze(['C08G01S03', 'C08G02S05', 'C08G03S04']);
const practicalInformationProjectIds = Object.freeze(['C08G01S01', 'C08G01S02']);

function isForumProject(id) {
  return forumProjectIds.includes(id);
}

function isPublicInformation(item) {
  const attributes = item.attributes || {};
  if ([attributes.categoryId, attributes.industryProjectId, item.projectId, item.project_id, item.categoryId].some(isForumProject)) return false;
  if (item.type !== 'community') return true;
  return practicalInformationProjectIds.includes(attributes.categoryId) ||
    (!!attributes.industryProjectId && !isForumProject(attributes.industryProjectId));
}

module.exports = {
  forumProjectIds,
  practicalInformationProjectIds,
  isForumProject,
  isPublicInformation,
  publicInteractions: false,
  benefitMode: 'points_only'
};
